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
  const search = url.searchParams.get("search")?.trim();
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
            student_id,
            application_fee_status,
            updated_at,
            form_type,
            course_id,
            cycle_id,
            form_data,
            users!applications_student_id_fkey (id, full_name, email, student_profiles(enrollment_number, profile_data)),
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
    console.log("🔍 DEO Search Term:", search);
    console.log("⚠️ Fetching all records for client-side filtering");
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const offset = (page - 1) * limit;

  console.log("📋 DEO Applications Page Load");
  console.log("Filters:", { courseId, cycleId, status, search, createdBy, updatedBy });
  console.log("Pagination:", { page, limit, offset });

  // Execute the query - if no search, use pagination; if search exists, fetch all for filtering
  let executeQuery = baseQuery;
  if (!search) {
    executeQuery = executeQuery.range(offset, offset + limit - 1);
  }
  
  const {
    data: applications,
    count: totalCount,
    error,
  } = await executeQuery;

  // Fetch admission forms to get form_fee for the 'Pay App Fee' button
  const { data: admissionForms } = await supabase
    .from("admission_forms")
    .select("course_id, cycle_id, form_type, form_fee");

  // Helper to join form fee
  const enrich = (list: any[]) => (list || []).map((app: any) => {
    const form = admissionForms?.find(
        (f) => 
            f.course_id === app.course_id && 
            f.cycle_id === app.cycle_id && 
            f.form_type === app.form_type
    );
    return {
        ...app,
        form_fee: form?.form_fee || 0
    };
  });

  if (error) {
    console.error("❌ Error fetching DEO applications:", error.message);
    console.error("Error details:", error);
    console.error("Error code:", error.code);
  } else {
    console.log("✅ DEO Applications fetched successfully");
    console.log("📊 Total Count (before filter):", totalCount);
    console.log("📋 Results Count (before filter):", applications?.length);
    
    // If search is active, filter client-side
    if (search && applications) {
      const searchLower = search.toLowerCase().trim();
      const filteredApplications = applications.filter((app: any) => {
        const firstName = (app.form_data?.first_name || '').toLowerCase();
        const middleName = (app.form_data?.middle_name || '').toLowerCase();
        const lastName = (app.form_data?.last_name || '').toLowerCase();
        
        return firstName.includes(searchLower) || 
               middleName.includes(searchLower) || 
               lastName.includes(searchLower);
      });
      
      console.log("🔍 Search filtered results:");
      console.log({
        searchTerm: search,
        totalMatches: filteredApplications.length,
        hasResults: filteredApplications.length > 0
      });
      
      if (filteredApplications.length > 0) {
        console.log("✅ First matching result:", {
          first_name: filteredApplications[0].form_data?.first_name,
          middle_name: filteredApplications[0].form_data?.middle_name,
          last_name: filteredApplications[0].form_data?.last_name
        });
      }
      
      // Apply pagination to filtered results
      const paginatedResults = filteredApplications.slice(offset, offset + limit);
      
      // Since we defined enrich below, we need to handle it. Actually let's move enrich up.
      return {
        applications: enrich(paginatedResults) || [],
        courses: courses || [],
        cycles: cycles || [],
        colleges: colleges || [],
        staffUsers: staffUsers || [],
        filters: { courseId, cycleId, status, search, createdBy, updatedBy },
        page,
        limit,
        totalCount: filteredApplications.length, // Total matches, not total records
        formTypesMap: Object.fromEntries(formTypesMap),
      };
    }
    
    console.log("📊 Search returned:", {
      searchTerm: search,
      totalCount,
      resultsCount: applications?.length,
      hasResults: (applications?.length || 0) > 0
    });
    
    if (applications && applications.length > 0) {
      console.log("📝 First result form_data (showing name fields):");
      const sample = applications[0];
      console.log({
        first_name: sample.form_data?.first_name,
        middle_name: sample.form_data?.middle_name,
        last_name: sample.form_data?.last_name
      });
    } else if (search) {
      console.warn("⚠️ Search found no results. Search term:", search);
    }
  }

  return {
    applications: enrich(applications || []),
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
