import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { generateReceiptNumber } from "$lib/server/receipt";
import { applyRoleBasedCollegeFilter } from "$lib/server/security";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  locals: { supabase, getAuthenticatedUser, userProfile },
  url,
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "deo") {
    throw redirect(303, "/login");
  }

  const courseId = url.searchParams.get("courseId");
  const cycleId = url.searchParams.get("cycleId");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const createdBy = url.searchParams.get("createdBy"); // 'student' or UUID
  const updatedBy = url.searchParams.get("updatedBy"); // 'student' or UUID

  // Fetch filters options
  let coursesQuery = supabase.from("courses").select("id, name, college_id"); // Select college_id for filter
  coursesQuery = applyRoleBasedCollegeFilter(
    coursesQuery,
    userProfile,
    "courses",
  );
  const { data: courses } = await coursesQuery;

  const { data: cycles } = await supabase
    .from("admission_cycles")
    .select("id, name");

  // Fetch colleges with UPI settings for QR code display
  const { data: colleges } = await supabase
    .from("colleges")
    .select("id, name, upi_vpa, upi_merchant_name, upi_enabled");

  // Fetch Staff Users for filter dropdown (DEO, Admins, etc.)
  // We assume 'student' role is distinct.
  const { data: staffUsers } = await supabase
    .from("users")
    .select("id, full_name, role")
    .in("role", ["deo", "adm_officer", "college_auth", "admin"])
    .order("full_name");

  // Fetch Form Types to identify provisional ones
  const { data: formTypesData } = await supabase
    .from("form_types")
    .select("name, is_prov");
  const formTypesMap = new Map();
  formTypesData?.forEach((ft) => {
    formTypesMap.set(ft.name, ft.is_prov);
  });

  // Build query for applications
  let baseQuery = supabase.from("applications").select(
    `
            id,
            status,
            updated_at,
            form_type,
            course_id,
            cycle_id,
            users!applications_student_id_fkey (id, full_name, email),
            courses!inner (name, college_id),
            branches(name),
            admission_cycles(name),
            creator:created_by(full_name, role),
            updater:updated_by(full_name, role),
            payments(id, amount, status, payment_type)
        `,
    { count: "exact" },
  );

  baseQuery = applyRoleBasedCollegeFilter(
    baseQuery,
    userProfile,
    "applications",
  );

  // Sort
  baseQuery = baseQuery.order("updated_at", { ascending: false });

  if (courseId) baseQuery = baseQuery.eq("course_id", courseId);
  if (cycleId) baseQuery = baseQuery.eq("cycle_id", cycleId);
  if (status) baseQuery = baseQuery.eq("status", status);

  // Created By Filter
  if (createdBy === "student") {
    baseQuery = baseQuery.eq("creator.role", "student");
  } else if (createdBy) {
    // Assume UUID
    baseQuery = baseQuery.eq("created_by", createdBy);
  }

  // Updated By Filter
  if (updatedBy === "student") {
    baseQuery = baseQuery.eq("updater.role", "student");
  } else if (updatedBy) {
    // Assume UUID
    baseQuery = baseQuery.eq("updated_by", updatedBy);
  }

  if (search) {
    baseQuery = baseQuery.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%`,
      { foreignTable: "users" },
    );
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const offset = (page - 1) * limit;

  // Execute the query to get data and count
  const {
    data: applications,
    count: totalCount,
    error,
  } = await baseQuery.range(offset, offset + limit - 1); // Apply range for data fetching

  if (error) {
    console.error("Error fetching DEO applications:", error.message);
    return {
      applications: [],
      courses: [],
      cycles: [],
      colleges: [],
      staffUsers: [],
      filters: { courseId, cycleId, status, search, createdBy, updatedBy },
      page,
      limit,
      totalCount: 0,
      formTypesMap: {},
    };
  }

  return {
    applications: applications || [],
    courses: courses || [],
    cycles: cycles || [],
    colleges: colleges || [],
    staffUsers: staffUsers || [],
    filters: { courseId, cycleId, status, search, createdBy, updatedBy },
    page,
    limit,
    totalCount: totalCount || 0,
    formTypesMap: Object.fromEntries(formTypesMap), // Convert Map to object for JSON serialization
  };
};

export const actions: Actions = {
  collectProvFee: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      return fail(403, { message: "Unauthorized" });
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const payment_mode = formData.get("payment_mode") as string;
    const reference_no = formData.get("reference_no") as string;

    if (!application_id || isNaN(amount) || !payment_mode || !reference_no) {
      return fail(400, { message: "Missing required payment details." });
    }

    console.log(
      `Collecting Prov Fee: AppID=${application_id}, Amount=${amount}`,
    );

    // Fetch application details to get academic year for receipt sequence
    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data: appData } = await supabaseAdmin
      .from("applications")
      .select(
        "cycle_id, course_id, admission_cycles(academic_year_id, academic_years(name, short_code)), courses(college_id)",
      )
      .eq("id", application_id)
      .single();

    const academicYearId = appData?.admission_cycles?.academic_year_id;
    const academicYearName = appData?.admission_cycles?.academic_years?.name;
    const academicYearShortCode = appData?.admission_cycles?.academic_years?.short_code;
    const collegeId = appData?.courses?.college_id;
    const courseId = appData?.course_id;

    // Generate Sequential Receipt Number
    const receipt_number = await generateReceiptNumber(
      supabaseAdmin,
      "provisional_fee",
      academicYearId,
      academicYearName,
      collegeId,
      courseId,
      academicYearShortCode,
    );

    // 1. Record Payment
    const { error: payError } = await supabase.from("payments").insert({
      application_id,
      amount,
      payment_type: "provisional_fee",
      payment_mode,
      reference_no,
      receipt_number, // Added receipt number
      transaction_id: reference_no, // Mapping reference to transaction_id as well for legacy compatibility
      status: "completed",
      payment_date: new Date().toISOString(),
    });

    if (payError) {
      console.error("Payment insert error:", payError);
      return fail(500, { message: "Failed to record payment." });
    }

    // 2. Update Application Fee Status
    // Even if provisional fee is separate, marking 'paid' helps general tracking.
    const { error: appError } = await supabase
      .from("applications")
      .update({ application_fee_status: "paid" })
      .eq("id", application_id);

    if (appError) {
      console.error("App update error:", appError);
      // Non-fatal if payment recorded
    }

    return { success: true };
  },
};
