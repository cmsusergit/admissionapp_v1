import type { PageServerLoad } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({ locals: { getSession, userProfile } }) => {
  const session = await getSession();
  if (
    !session ||
    (userProfile?.role !== "adm_officer" && userProfile?.role !== "admin")
  ) {
    throw redirect(303, "/login");
  }

  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Fetch courses with college details
  const { data: courses, error: coursesErr } = await supabaseAdmin
    .from("courses")
    .select(`
      id,
      name,
      code,
      college_id,
      colleges(name)
    `)
    .order("name");

  if (coursesErr) {
    console.error("Error fetching courses:", coursesErr);
  }

  // 2. Fetch branches
  const { data: branches, error: branchesErr } = await supabaseAdmin
    .from("branches")
    .select(`
      id,
      name,
      code,
      course_id
    `)
    .order("name");

  if (branchesErr) {
    console.error("Error fetching branches:", branchesErr);
  }

  // 3. Fetch form types
  const { data: formTypesData } = await supabaseAdmin
    .from("form_types")
    .select("name, is_prov")
    .order("name");

  // 4. Fetch applications for admitted and paid students summary
  const { data: rawApps, error: appsErr } = await supabaseAdmin
    .from("applications")
    .select(`
      id,
      student_id,
      course_id,
      branch_id,
      status,
      form_type,
      admission_type,
      submitted_at,
      form_data,
      application_fee_status,
      courses(id, name, code, colleges(name)),
      branches(id, name, code),
      student_user:users!student_id(
        id,
        full_name,
        email,
        student_profiles(enrollment_number, admission_status, profile_data)
      ),
      account_admissions(admission_number),
      payments(id, payment_type, status, amount, receipt_number)
    `)
    .neq("status", "draft")
    .neq("status", "cancelled")
    .neq("status", "removed");

  if (appsErr) {
    console.error("Error fetching applications for report:", appsErr);
  }

  // Filter base pool of students with College ID assigned
  const allStudentApps = (rawApps || []).filter((app: any) => {
    const profiles = app.student_user?.student_profiles;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    return !!profile?.enrollment_number;
  });

  // Unique list of form types & admission types present in actual applications
  const activeFormTypesSet = new Set<string>();
  const activeAdmissionTypesSet = new Set<string>(["Regular", "D2D", "C2D"]);

  (rawApps || []).forEach((app: any) => {
    if (app.form_type) activeFormTypesSet.add(app.form_type);
    if (app.admission_type) activeAdmissionTypesSet.add(app.admission_type);
  });
  if (formTypesData) {
    formTypesData.forEach((ft) => activeFormTypesSet.add(ft.name));
  }

  const availableFormTypes = Array.from(activeFormTypesSet).sort();
  const availableAdmissionTypes = Array.from(activeAdmissionTypesSet).sort();

  // Format ALL matching student items for complete client-side accuracy (no slicing)
  const allStudents = allStudentApps.map((app: any, idx: number) => {
    const profiles = app.student_user?.student_profiles;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const profileData = profile?.profile_data || {};
    const admissionEntry = Array.isArray(app.account_admissions)
      ? app.account_admissions[0]
      : app.account_admissions;

    const contact =
      profileData.contact_number ||
      profileData.mobile ||
      app.form_data?.mobile ||
      app.form_data?.contact_number ||
      "-";

    const photo = profileData.photo || app.form_data?.photo || "";

    const address = [
      profileData.p_address_line_1 || app.form_data?.address_line_1,
      profileData.p_city || app.form_data?.city,
      profileData.p_state || app.form_data?.state,
    ]
      .filter(Boolean)
      .join(", ") || "-";

    const payments = Array.isArray(app.payments) ? app.payments : [];
    const hasTuitionPaid = payments.some(
      (p: any) => p.payment_type === "tuition_fee" && p.status === "completed"
    );
    const hasAppFeePaid =
      payments.some(
        (p: any) => p.payment_type === "application_fee" && p.status === "completed"
      ) || app.application_fee_status === "paid";
    const hasAnyPaid = payments.some((p: any) => p.status === "completed") || hasAppFeePaid;

    return {
      srNo: idx + 1,
      id: app.id,
      studentName: app.student_user?.full_name || "N/A",
      email: app.student_user?.email || "-",
      contact,
      collegeId: profile?.enrollment_number || admissionEntry?.admission_number || "Pending",
      admissionNo: admissionEntry?.admission_number || "-",
      photoUrl: photo,
      dob: profileData.birth_date || app.form_data?.dob || app.form_data?.date_of_birth || "-",
      address,
      college: app.courses?.colleges?.name || "N/A",
      course: app.courses?.name || "N/A",
      courseId: app.course_id,
      branch: app.branches?.name || "N/A",
      branchId: app.branch_id,
      admissionStatus: profile?.admission_status || "Admitted",
      admissionType: app.admission_type || "Regular",
      appStatus: app.status || "",
      formType: app.form_type || "-",
      isProv: app.form_type?.toLowerCase().includes("provisional") || false,
      hasTuitionPaid,
      hasAppFeePaid,
      hasAnyPaid,
    };
  });

  return {
    courses: courses || [],
    branches: branches || [],
    formTypes: availableFormTypes,
    admissionTypes: availableAdmissionTypes,
    provFormTypes: formTypesData?.filter((ft) => ft.is_prov).map((ft) => ft.name) || ["Provisional"],
    totalAdmitted: allStudentApps.length,
    allStudents,
  };
};
