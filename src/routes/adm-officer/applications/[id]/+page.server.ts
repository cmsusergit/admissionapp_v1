import { redirect, error, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { approveApplicationLogic } from "$lib/server/application";

export const load: PageServerLoad = async ({
  params,
  locals: { supabase, getSession, userProfile },
}) => {
  const session = await getSession();

  if (!session) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "adm_officer" && userProfile?.role !== "admin") {
    throw redirect(303, "/login");
  }

  const { id } = params;

  // Use Service Role to bypass RLS for fetching details
  // This ensures Adm Officer sees everything even if RLS policies are tricky or broken
  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: application, error: appError } = await supabaseAdmin
    .from("applications")
    .select(
      `
            id, status, form_type, submitted_at, updated_at, student_id, course_id, cycle_id, branch_id, form_data, application_fee_status, created_by, updated_by, approval_comment,
            student_user:users!applications_student_id_fkey(id, full_name, email, student_profiles(enrollment_number)),
            creator_user:users!applications_created_by_fkey(id, full_name, email),
            updater_user:users!applications_updated_by_fkey(id, full_name, email),
            courses(id, name, code, colleges(id, name, universities(id, name))),
            branches(id, name, code),
            admission_cycles(id, name, academic_years(name)),
            payments(*),
            marks(*),
            account_admissions(*),
            form_types(id, name, auto_approve_on_verification)
        `,
    )
    .eq("id", id)
    .single();

  if (appError) {
    console.error("Error fetching application details:", appError.message);
    throw error(500, "Error fetching application details");
  }

  if (!application) {
    throw error(404, "Application not found");
  }

  // Fetch documents separately to ensure no join/RLS weirdness
  const { data: docs, error: docError } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("application_id", id);

  if (docError) {
    console.error("Error fetching documents separately:", docError.message);
  }

  application.documents = docs || [];

  // Debugging: Check if documents are being fetched
  if (application.documents) {
    console.log(
      `[Debug] Application ${id} has ${application.documents.length} documents.`,
    );
  } else {
    console.log(
      `[Debug] Application ${id} has NO documents property (or null).`,
    );
  }

  // Generate signed URLs for documents using Admin client to ensure access
  if (application.documents && application.documents.length > 0) {
    for (const doc of application.documents) {
      const { data: signedData, error: signedError } =
        await supabaseAdmin.storage
          .from("documents")
          .createSignedUrl(doc.file_path, 3600); // Valid for 1 hour

      if (signedData) {
        doc.signed_url = signedData.signedUrl;
      } else {
        console.warn(
          `Failed to sign URL for ${doc.file_path}:`,
          signedError?.message,
        );
      }
    }
  }

  // Fetch form schema to help render form data correctly
  const { data: formSchema } = await supabaseAdmin
    .from("admission_forms")
    .select("schema_json")
    .eq("course_id", application.course_id)
    .eq("cycle_id", application.cycle_id)
    .eq("form_type", application.form_type)
    .eq("is_enabled", true)
    .maybeSingle();

  // Fetch lists for Transfer Modal
  const { data: allCourses } = await supabaseAdmin
    .from("courses")
    .select("id, name, code, branches(id, name, code)")
    .order("name");

  const { data: allCycles } = await supabaseAdmin
    .from("admission_cycles")
    .select("id, name")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  // Fetch Form Types for Transfer
  const { data: allFormTypes } = await supabaseAdmin
    .from("form_types")
    .select("name")
    .eq("is_active", true)
    .order("name");

  return {
    application,
    formSchema: formSchema?.schema_json || null,
    allCourses: allCourses || [],
    allCycles: allCycles || [],
    allFormTypes: allFormTypes || [],
  };
};

export const actions: Actions = {
  verifyApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const approval_comment =
      (formData.get("approval_comment") as string) || null;

    // Fetch application to check form_type and its configuration
    // We try to fetch the new flag 'auto_approve_on_verification' if it exists.
    // If not, we fall back to a code-based config.
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select(
        `
                form_type, 
                form_types (
                    requires_merit_calculation,
                    auto_approve_on_verification
                )
            `,
      )
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return fail(404, { message: "Application not found." });
    }
    
    application.documents = docs || [];

    // Determine Approval Flow
    // 1. Try DB configuration (Priority)
    // 2. Fallback to hardcoded defaults (if DB column missing/migration pending)
    let shouldAutoApprove = false;

    const formTypeData = application.form_types
      ? Array.isArray(application.form_types)
        ? application.form_types[0]
        : application.form_types
      : null;

    if (formTypeData && "auto_approve_on_verification" in formTypeData) {
      shouldAutoApprove = formTypeData.auto_approve_on_verification;
    } else {
      // Fallback Configuration
      const AUTO_APPROVE_DEFAULTS: Record<string, boolean> = {
        Provisional: true,
        ACPC: true,
        "MQ/NRI": false,
        Vacant: false,
        D2D: false,
      };
      shouldAutoApprove = AUTO_APPROVE_DEFAULTS[application.form_type] || false;

      // Legacy fallback: if requires_merit_calculation is FALSE, we used to auto-approve
      // Only apply if form type not in defaults
      if (!(application.form_type in AUTO_APPROVE_DEFAULTS)) {
        const requiresMerit = formTypeData?.requires_merit_calculation ?? true;
        if (!requiresMerit) shouldAutoApprove = true;
      }
    }

    if (shouldAutoApprove) {
      // Direct Approval Logic for specific form types
      // Use Service Role to bypass RLS for Sequence Creation/Increment
      const supabaseAdmin = createClient(
        PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );

      const result = await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        userProfile.id,
        application.form_type,
        approval_comment,
      );

      if (!result.success) {
        return fail(result.status || 500, {
          message: result.message,
          error: true,
        });
      }
      return {
        success: true,
        message: `Application approved directly (Type: ${application.form_type})! Admission No: ${result.admissionNumber}`,
      };
    } else {
      // Standard Flow: Verify and forward to University/Admin
      const { error } = await supabase
        .from("applications")
        .update({ status: "verified", approval_comment })
        .eq("id", application_id);

      if (error) {
        console.error("Error verifying application:", error.message);
        return fail(500, {
          message: "Failed to verify application.",
          error: true,
        });
      }

      // Auto-verify (approve) all associated documents
      const { error: docError } = await supabase
        .from("documents")
        .update({ status: "approved" })
        .eq("application_id", application_id);

      if (docError) {
        console.error("Error auto-approving documents:", docError.message);
      }

      return {
        success: true,
        message:
          "Application verified and forwarded to University Authority. All documents auto-approved.",
      };
    }
  },

  revertVerification: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    // Check current status
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("status")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return fail(404, { message: "Application not found." });
    }

    if (application.status !== "verified") {
      return fail(400, {
        message: 'Can only revert applications that are currently "Verified".',
        error: true,
      });
    }

    const { error } = await supabase
      .from("applications")
      .update({ status: "submitted" }) // Revert to submitted
      .eq("id", application_id);

    if (error) {
      console.error("Error reverting verification:", error.message);
      return fail(500, {
        message: "Failed to revert verification.",
        error: true,
      });
    }

    return {
      success: true,
      message:
        'Verification reverted. Application is now "Submitted" (Unlocked).',
    };
  },

  revertSelfApproval: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // Check current status and form type
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select("status, form_types(auto_approve_on_verification)")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return fail(404, { message: "Application not found." });
    }

    if (application.status !== "approved") {
      return fail(400, {
        message: 'Can only revert applications that are currently "Approved".',
        error: true,
      });
    }

    // Check if form type allows self-approval
    const formTypeData = application.form_types
      ? Array.isArray(application.form_types)
        ? application.form_types[0]
        : application.form_types
      : null;

    const isSelfApproved = formTypeData?.auto_approve_on_verification === true;

    if (!isSelfApproved) {
      return fail(400, {
        message:
          "Cannot revert approval for this application type. Contact University Authority.",
        error: true,
      });
    }

    // Delete from account_admissions to remove admission number
    await supabaseAdmin
      .from("account_admissions")
      .delete()
      .eq("application_id", application_id);

    // Revert status to verified
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({ status: "verified" })
      .eq("id", application_id);

    if (updateError) {
      console.error("Error reverting self-approval:", updateError.message);
      return fail(500, {
        message: "Failed to revert approval.",
        error: true,
      });
    }

    return {
      success: true,
      message: "Approval reverted. Application is now in verification queue.",
    };
  },

  rejectApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const rejection_reason = formData.get("rejection_reason") as string;

    const { error } = await supabase
      .from("applications")
      .update({ status: "rejected", rejection_reason: rejection_reason })
      .eq("id", application_id);

    if (error) {
      console.error("Error rejecting application:", error.message);
      return fail(500, {
        message: "Failed to reject application.",
        error: true,
      });
    }

    return { success: true, message: "Application rejected." };
  },

  markFeePaid: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const approval_comment =
      (formData.get("approval_comment") as string) || null;

    // Fetch application details to get form fee
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("course_id, cycle_id, form_type, application_fee_status")
      .eq("id", application_id)
      .single();

    if (appError || !application) {
      return fail(404, { message: "Application not found.", error: true });
    }

    if (application.application_fee_status === "paid") {
      return fail(400, { message: "Fee already paid.", error: true });
    }

    // Get form fee amount
    const { data: formDetails } = await supabase
      .from("admission_forms")
      .select("form_fee")
      .eq("course_id", application.course_id)
      .eq("cycle_id", application.cycle_id)
      .eq("form_type", application.form_type)
      .single();

    const amount = formDetails?.form_fee || 0;

    // Use Service Role to bypass RLS for application updates
    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // Record Manual Payment
    const { error: payError } = await supabase.from("payments").insert({
      application_id,
      amount,
      payment_type: "application_fee",
      transaction_id: `MANUAL-${Date.now()}`,
      status: "completed",
      payment_date: new Date().toISOString(),
    });

    if (payError) {
      console.error("Error recording manual payment:", payError.message);
      return fail(500, { message: "Failed to record payment.", error: true });
    }

    // Update status using Service Role to bypass RLS
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({ application_fee_status: "paid", approval_comment })
      .eq("id", application_id);

    if (updateError) {
      console.error("Error updating fee status:", updateError.message);
      return fail(500, {
        message: "Payment recorded but status update failed.",
        error: true,
      });
    }

    return {
      success: true,
      message: "Application fee marked as PAID manually.",
    };
  },

  cancelAdmission: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const reason = formData.get("reason") as string;

    if (!application_id || !reason) {
      return fail(400, {
        message: "Application ID and reason are required.",
        error: true,
      });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // 1. Fetch Current State for history
    const { data: appData, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select("student_id, course_id, branch_id")
      .eq("id", application_id)
      .single();

    if (fetchError || !appData) {
      return fail(404, { message: "Application not found.", error: true });
    }

    const { data: profile } = await supabaseAdmin
        .from("student_profiles")
        .select("enrollment_number")
        .eq("user_id", appData.student_id)
        .single();

    // 2. Perform Updates in "Transaction" (Manual sequence)
    
    // a. Record History
    await supabaseAdmin
      .from("student_transfer_history")
      .insert({
        application_id: application_id,
        previous_course_id: appData.course_id,
        previous_branch_id: appData.branch_id,
        previous_enrollment_number: profile?.enrollment_number,
        new_enrollment_number: null, // Indicates cancellation
        transferred_by: userProfile.id,
      });

    // b. Revoke Enrollment Number & Update Status (Student Profile)
    const { error: profileError } = await supabaseAdmin
      .from("student_profiles")
      .update({ 
        enrollment_number: null,
        admission_status: 'Cancelled'
      })
      .eq("user_id", appData.student_id);

    if (profileError) {
      console.error("Error clearing enrollment number:", profileError.message);
    }

    // c. Delete Account Admission (Releases Admission Number)
    await supabaseAdmin
      .from("account_admissions")
      .delete()
      .eq("application_id", application_id);

    // d. Update Application Status
    const { error: appUpdateError } = await supabaseAdmin
      .from("applications")
      .update({
        status: "cancelled",
        rejection_reason: `Cancelled: ${reason}`,
      })
      .eq("id", application_id);

    if (appUpdateError) {
      console.error("Error cancelling application:", appUpdateError.message);
      return fail(500, {
        message: "Failed to update application status.",
        error: true,
      });
    }

    return { success: true, message: "Admission cancelled successfully." };
  },

  transferStudent: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const new_course_id = formData.get("new_course_id") as string;
    const new_cycle_id = formData.get("new_cycle_id") as string;
    const new_form_type = formData.get("new_form_type") as string;
    const new_branch_id = (formData.get("new_branch_id") as string) || null; // Can be null
    const enrollment_prefix_letter = formData.get(
      "enrollment_prefix_letter",
    ) as string; // New: Prefix Letter

    if (
      !application_id ||
      !new_course_id ||
      !new_cycle_id ||
      !new_form_type ||
      !enrollment_prefix_letter
    ) {
      return fail(400, {
        message: "Missing required transfer details.",
        error: true,
      });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // 1. Fetch Target Details & Check Vacancy
    const { data: courseData } = await supabaseAdmin
      .from("courses")
      .select("intake_capacity, code, college_id, branches(id, code)")
      .eq("id", new_course_id)
      .single();

    if (!courseData) {
      return fail(404, { message: "Target course not found.", error: true });
    }

    // Simple Vacancy Check (Optimistic)
    const { count: admittedCount } = await supabaseAdmin
      .from("applications")
      .select("id", { count: 'exact', head: true })
      .eq("course_id", new_course_id)
      .eq("cycle_id", new_cycle_id)
      .eq("status", "approved");

    const capacity = courseData.intake_capacity || 0;
    const currentAdmitted = admittedCount || 0;

    if (capacity > 0 && currentAdmitted >= capacity) {
        return fail(400, { 
            message: `No vacancy in target course. Capacity: ${capacity}, Admitted: ${currentAdmitted}`,
            error: true 
        });
    }

    // 2. Fetch Current Application & Profile
    const { data: currentApp, error: appFetchError } = await supabaseAdmin
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appFetchError || !currentApp) {
      return fail(404, { message: "Application not found.", error: true });
    }

    const { data: studentProfile } = await supabaseAdmin
      .from("student_profiles")
      .select("enrollment_number, profile_data")
      .eq("user_id", currentApp.student_id)
      .maybeSingle();

    // 3. Fetch Target Schema & Merge Form Data
    const { data: targetForm } = await supabaseAdmin
      .from("admission_forms")
      .select("schema_json")
      .eq("course_id", new_course_id)
      .eq("cycle_id", new_cycle_id)
      .eq("form_type", new_form_type)
      .maybeSingle();

    const targetSchema = targetForm?.schema_json;
    let newFormData = { ...currentApp.form_data };
    if (targetSchema && targetSchema.fields && studentProfile?.profile_data) {
      const profileData = studentProfile.profile_data;
      targetSchema.fields.forEach((field: any) => {
        let val = undefined;
        if (field.profileFieldKey && profileData[field.profileFieldKey] !== undefined) {
          val = profileData[field.profileFieldKey];
        } else if (profileData[field.key] !== undefined) {
          val = profileData[field.key];
        }
        if (val !== undefined && val !== null && val !== "") {
          newFormData[field.key] = val;
        }
      });
    }

    // 4. Generate New Enrollment Number
    const { data: cycleData } = await supabaseAdmin
      .from("admission_cycles")
      .select("academic_year_id, academic_years(name)")
      .eq("id", new_cycle_id)
      .single();

    if (!cycleData) {
      return fail(500, { message: "Failed to fetch cycle details.", error: true });
    }

    let branchCode = "GEN";
    if (new_branch_id && courseData.branches) {
      const b = (courseData.branches as any[]).find((b: any) => b.id === new_branch_id);
      if (b) branchCode = b.code || "BR";
    }

    const courseCode = courseData.code || "CRS";
    const yearName = cycleData.academic_years?.name || "2025";
    const yearStart = yearName.substring(0, 4).slice(-2);

    // Format: YY + Course + Branch + Prefix Letter
    const prefix = `${yearStart}${courseCode}${branchCode}${enrollment_prefix_letter}`;

    // Fetch/Increment Sequence
    let { data: sequence } = await supabaseAdmin
      .from("admission_sequences")
      .select("id, current_sequence")
      .eq("college_id", courseData.college_id)
      .eq("course_id", new_course_id)
      .eq("academic_year_id", cycleData.academic_year_id)
      .eq("prefix", prefix)
      .maybeSingle();

    if (!sequence) {
      const { data: newSeq } = await supabaseAdmin
        .from("admission_sequences")
        .insert({
          college_id: courseData.college_id,
          course_id: new_course_id,
          academic_year_id: cycleData.academic_year_id,
          prefix: prefix,
          current_sequence: 0,
        })
        .select()
        .single();
      sequence = newSeq;
    }

    const newSequenceNumber = (sequence?.current_sequence ?? 0) + 1;
    const newEnrollmentNumber = `${prefix}${newSequenceNumber.toString().padStart(3, "0")}`;

    // 5. Update All Records (Manual Transaction)
    
    // a. Update Sequence
    if (sequence) {
      await supabaseAdmin
        .from("admission_sequences")
        .update({ current_sequence: newSequenceNumber })
        .eq("id", sequence.id);
    }

    // b. Record History
    const { error: histError } = await supabaseAdmin
      .from("student_transfer_history")
      .insert({
        application_id: application_id,
        previous_course_id: currentApp.course_id,
        previous_branch_id: currentApp.branch_id,
        previous_enrollment_number: studentProfile?.enrollment_number,
        new_enrollment_number: newEnrollmentNumber,
        transferred_by: userProfile.id,
      });

    if (histError) {
      console.error("History insert error:", histError);
      return fail(500, { message: "Failed to record transfer history.", error: true });
    }

    // c. Update Student Profile
    await supabaseAdmin
      .from("student_profiles")
      .update({ enrollment_number: newEnrollmentNumber })
      .eq("user_id", currentApp.student_id);

    // d. Update Application & Revert Status to 'verified' for fee review
    const { error: appUpdateError } = await supabaseAdmin
      .from("applications")
      .update({
        course_id: new_course_id,
        cycle_id: new_cycle_id,
        branch_id: new_branch_id,
        form_type: new_form_type,
        form_data: newFormData,
        status: "verified", // Re-verify to ensure fee collection review
        approval_comment: `Transferred from ${currentApp.course_id}. Needs fee review.`
      })
      .eq("id", application_id);

    // e. Remove old account admission (optional, but clean)
    await supabaseAdmin
      .from("account_admissions")
      .delete()
      .eq("application_id", application_id);

    if (appUpdateError) {
      return fail(500, { message: "Failed to update application details.", error: true });
    }

    return {
      success: true,
      message: `Student transferred successfully! New Enrollment ID: ${newEnrollmentNumber}. Status reverted to 'verified' for fee review.`,
    };
  },
};
