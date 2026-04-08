import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  url,
  locals: { supabase, getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (
    userProfile?.role !== "univ_auth" &&
    userProfile?.role !== "university_auth"
  ) {
    throw redirect(303, "/login"); // Redirect non-university_auth users
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const search = url.searchParams.get("search") || "";
  const activeTab = url.searchParams.get("tab") || "verified";
  const offset = (page - 1) * limit;

  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1. Get Colleges & Courses for this university to filter safely
  if (!userProfile.university_id) {
    return { applications: [], count: 0, page, limit, search, activeTab };
  }

  // Get Colleges
  const { data: colleges } = await supabaseAdmin
    .from("colleges")
    .select("id")
    .eq("university_id", userProfile.university_id);

  const collegeIds = colleges?.map((c) => c.id) || [];

  // Get Courses
  const { data: courses } = await supabaseAdmin
    .from("courses")
    .select("id")
    .in("college_id", collegeIds);

  const courseIds = courses?.map((c) => c.id) || [];

  // Build query using Service Role
  let query = supabaseAdmin
    .from("applications")
    .select(
      `
            id, status, form_type, submitted_at, updated_at, student_id, course_id, cycle_id, branch_id, form_data, application_fee_status, created_by, updated_by, approval_comment, rejection_reason,
            courses(id, name, colleges(id, name, universities(name)), branches(id, name, code)),
            admission_cycles(id, name, academic_years(id, name)),
            users!student_id!inner(full_name, email),
            documents(*)
        `,
      { count: "exact" },
    )
    .in("course_id", courseIds);

  // Status Filter
  if (activeTab === "verified") {
    query = query.eq("status", "verified");
  } else if (activeTab === "approved") {
    query = query.eq("status", "approved");
  }

  // Search Filter
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, {
      foreignTable: "users",
    });
  }

  // Pagination & Sort
  query = query
    .order("submitted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: applications, count, error: appError } = await query;

  if (appError) {
    console.error(
      "Error fetching applications for university auth:",
      appError.message,
    );
    return {
      applications: [],
      message: "Error fetching applications.",
      count: 0,
      page,
      limit,
      search,
      activeTab,
    };
  }

  // Sign URLs for documents
  if (applications && applications.length > 0) {
    for (const app of applications) {
      if (app.documents && app.documents.length > 0) {
        for (const doc of app.documents) {
          const { data: signedData } = await supabaseAdmin.storage
            .from("documents")
            .createSignedUrl(doc.file_path, 3600); // 1 hour expiry

          if (signedData) {
            doc.signed_url = signedData.signedUrl;
          }
        }
      }
    }
  }

  return {
    applications: applications || [],
    count: count || 0,
    page,
    limit,
    search,
    activeTab,
    message: null,
  };
};

import { approveApplicationLogic } from "$lib/server/application";

export const actions: Actions = {
  approveApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    try {
      const authenticatedUser = await getAuthenticatedUser();
      if (
        !authenticatedUser ||
        (userProfile?.role !== "univ_auth" &&
          userProfile?.role !== "university_auth")
      ) {
        throw redirect(303, "/login");
      }

      const supabaseAdmin = createClient(
        PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );

      const formData = await request.formData();
      const application_id = formData.get("application_id") as string;
      const branch_id = formData.get("branch_id") as string;
      const approval_comment =
        (formData.get("approval_comment") as string) || null;

      // If a branch is selected (e.g. for MQ/NRI), update the application first
      // We MUST also set status to 'approved' here to satisfy the RLS policy which restricts updates to status changes
      if (branch_id) {
        const { error: branchUpdateError } = await supabaseAdmin
          .from("applications")
          .update({ branch_id, status: "approved", approval_comment })
          .eq("id", application_id);

        if (branchUpdateError) {
          console.error(
            "Error updating branch/status for application:",
            branchUpdateError.message,
          );
          return fail(500, {
            message:
              "Failed to update branch selection. " + branchUpdateError.message,
            error: true,
          });
        }
      } else if (approval_comment) {
        // Update approval_comment even without branch change using Service Role to bypass RLS
        const { error: commentError } = await supabaseAdmin
          .from("applications")
          .update({ approval_comment })
          .eq("id", application_id);

        if (commentError) {
          console.error(
            "Error updating approval comment:",
            commentError.message,
          );
        }
      }

      const result = await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        userProfile.id,
        "Merit",
        approval_comment,
      );

      if (!result.success) {
        return fail(result.status || 500, {
          message: result.message,
          error: true,
        });
      }

      return { success: true, message: result.message };
    } catch (e: any) {
      console.error("Exception in approveApplication:", e);
      // Handle redirect separately as it throws
      if (e.status === 303 || e.status === 307) {
        throw e;
      }
      return fail(500, {
        message: "Internal Server Error: " + (e.message || e),
        error: true,
      });
    }
  },

  revertApproval: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      (userProfile?.role !== "univ_auth" &&
        userProfile?.role !== "university_auth")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    // Check status
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("status")
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

    // Cleanup: Delete from account_admissions first (to remove generated admission number)
    const { error: deleteAdmError } = await supabase
      .from("account_admissions")
      .delete()
      .eq("application_id", application_id);

    if (deleteAdmError) {
      console.error(
        "Error deleting account admission:",
        deleteAdmError.message,
      );
      // We might continue if it doesn't exist, but it's risky. Let's log and proceed.
    }

    // Revert status to verified
    const { error } = await supabase
      .from("applications")
      .update({ status: "verified" })
      .eq("id", application_id);

    if (error) {
      console.error("Error reverting approval:", error.message);
      return fail(500, { message: "Failed to revert approval.", error: true });
    }

    return {
      success: true,
      message:
        'Approval reverted. Application is now "Verified" and back in queue.',
    };
  },

  waitlistApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      (userProfile?.role !== "univ_auth" &&
        userProfile?.role !== "university_auth")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const approval_comment =
      (formData.get("approval_comment") as string) || null;

    // Update application status to 'waitlisted'
    const { error } = await supabase
      .from("applications")
      .update({ status: "waitlisted", approval_comment })
      .eq("id", application_id);

    if (error) {
      console.error("Error waitlisting application:", error.message);
      return fail(500, {
        message: "Failed to waitlist application.",
        error: true,
      });
    }

    return { success: true, message: "Application waitlisted." };
  },

  rejectApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      (userProfile?.role !== "univ_auth" &&
        userProfile?.role !== "university_auth")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const rejection_reason = formData.get("rejection_reason") as string;

    // Update application status to 'rejected' and save rejection reason
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
};
