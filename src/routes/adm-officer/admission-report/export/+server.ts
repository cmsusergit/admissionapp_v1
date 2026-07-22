import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import * as XLSX from "xlsx";

export const GET: RequestHandler = async ({
  url,
  locals: { getSession, userProfile },
}) => {
  const session = await getSession();
  if (
    !session ||
    (userProfile?.role !== "adm_officer" && userProfile?.role !== "admin")
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  const branchesParam = url.searchParams.get("branches");
  const selectedBranchIds = branchesParam
    ? branchesParam.split(",").filter(Boolean)
    : [];

  const coursesParam = url.searchParams.get("courses");
  const selectedCourseIds = coursesParam
    ? coursesParam.split(",").filter(Boolean)
    : [];

  const formTypesParam = url.searchParams.get("form_types");
  const selectedFormTypes = formTypesParam
    ? formTypesParam.split(",").filter(Boolean)
    : [];

  const fieldsParam = url.searchParams.get("fields");
  const selectedFields = fieldsParam
    ? fieldsParam.split(",").filter(Boolean)
    : null;

  const sheetMode = url.searchParams.get("sheet_mode") || "branch"; // 'branch' | 'course' | 'single'
  const includeSummary = url.searchParams.get("include_summary") !== "false";
  const searchParam = url.searchParams.get("search") || "";

  // Filters:
  const excludeProvisional = url.searchParams.get("exclude_provisional") !== "false"; // Default true
  const admissionStatusFilter = url.searchParams.get("admission_status") || "admitted"; // 'admitted' | 'approved' | 'all'
  const admissionTypeFilter = url.searchParams.get("admission_type") || "Regular"; // Default 'Regular'
  const paymentStatusFilter = url.searchParams.get("payment_status") || "paid"; // 'paid' | 'tuition_paid' | 'app_fee_paid' | 'all'

  // 1. Fetch Branches & Courses & Form Types for name lookup
  const [coursesRes, branchesRes, provFormTypesRes] = await Promise.all([
    supabaseAdmin.from("courses").select("id, name, code, college_id, colleges(name)"),
    supabaseAdmin.from("branches").select("id, name, code, course_id"),
    supabaseAdmin.from("form_types").select("name, is_prov"),
  ]);

  const allCourses = coursesRes.data || [];
  const allBranches = branchesRes.data || [];
  const provFormTypeNames = new Set(
    (provFormTypesRes.data || [])
      .filter((ft) => ft.is_prov)
      .map((ft) => ft.name.toLowerCase())
  );
  provFormTypeNames.add("provisional");

  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const branchMap = new Map(allBranches.map((b) => [b.id, b]));

  // 2. Fetch Applications
  let query = supabaseAdmin
    .from("applications")
    .select(
      `
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
      `
    )
    .neq("status", "draft")
    .neq("status", "cancelled")
    .neq("status", "removed")
    .order("submitted_at", { ascending: false });

  if (selectedCourseIds.length > 0) {
    query = query.in("course_id", selectedCourseIds);
  }

  if (selectedBranchIds.length > 0) {
    query = query.in("branch_id", selectedBranchIds);
  }

  if (selectedFormTypes.length > 0) {
    query = query.in("form_type", selectedFormTypes);
  }

  const { data: applications, error } = await query;

  if (error) {
    console.error("Admission report export query error:", error);
    return new Response("Error fetching data: " + error.message, {
      status: 500,
    });
  }

  // 3. Filter based on provisional flag, admission type, admission status, payment status, and search query
  const filteredStudents = (applications || []).filter((app: any) => {
    const profiles = app.student_user?.student_profiles;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const enrollmentNo = profile?.enrollment_number || "";

    // College ID check: Must have College ID assigned
    if (!enrollmentNo) return false;

    // Provisional Admission Check
    const formTypeLower = (app.form_type || "").toLowerCase().trim();
    const isProvisional = provFormTypeNames.has(formTypeLower) || formTypeLower.includes("provisional");
    if (excludeProvisional && isProvisional) {
      return false;
    }

    // Admission Type Filter (Default: 'Regular')
    const appAdmissionType = app.admission_type || "Regular";
    if (admissionTypeFilter !== "all" && admissionTypeFilter !== "") {
      if (appAdmissionType.toLowerCase() !== admissionTypeFilter.toLowerCase()) {
        return false;
      }
    }

    // Admission Status Filter
    const admStatus = (profile?.admission_status || "").toLowerCase();
    const appStatus = (app.status || "").toLowerCase();
    if (admissionStatusFilter === "admitted") {
      if (admStatus !== "admitted" && appStatus !== "approved") return false;
    } else if (admissionStatusFilter === "approved") {
      if (appStatus !== "approved") return false;
    }

    // Payment Status Filter
    const payments = Array.isArray(app.payments) ? app.payments : [];
    const hasTuitionPaid = payments.some(
      (p: any) => p.payment_type === "tuition_fee" && p.status === "completed"
    );
    const hasAppFeePaid =
      payments.some(
        (p: any) => p.payment_type === "application_fee" && p.status === "completed"
      ) || app.application_fee_status === "paid";
    const hasAnyPaid = payments.some((p: any) => p.status === "completed") || hasAppFeePaid;

    if (paymentStatusFilter === "paid" && !hasAnyPaid) return false;
    if (paymentStatusFilter === "tuition_paid" && !hasTuitionPaid) return false;
    if (paymentStatusFilter === "app_fee_paid" && !hasAppFeePaid) return false;

    // Search Query Filter
    const matchesSearch =
      !searchParam.trim() ||
      app.student_user?.full_name
        ?.toLowerCase()
        .includes(searchParam.toLowerCase()) ||
      app.student_user?.email
        ?.toLowerCase()
        .includes(searchParam.toLowerCase()) ||
      enrollmentNo.toLowerCase().includes(searchParam.toLowerCase());

    return matchesSearch;
  });

  if (filteredStudents.length === 0) {
    return new Response(
      "No student records found matching the selected criteria.",
      { status: 404 }
    );
  }

  // Field mapping definitions
  const availableFieldMap: Record<
    string,
    { label: string; getValue: (app: any) => string }
  > = {
    student_name: {
      label: "Student Name",
      getValue: (app) => app.student_user?.full_name || "",
    },
    contact: {
      label: "Contact Number",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        return (
          pData.contact_number ||
          pData.mobile ||
          app.form_data?.mobile ||
          app.form_data?.contact_number ||
          ""
        );
      },
    },
    email: {
      label: "Email ID",
      getValue: (app) => app.student_user?.email || "",
    },
    college_id: {
      label: "College ID (Enrollment No)",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.enrollment_number || "";
      },
    },
    photo_url: {
      label: "Photo URL",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        return pData.photo || app.form_data?.photo || "";
      },
    },
    dob: {
      label: "Date of Birth",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        return (
          pData.birth_date ||
          app.form_data?.dob ||
          app.form_data?.date_of_birth ||
          ""
        );
      },
    },
    address: {
      label: "Address",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        const pAddr = [
          pData.p_address_line_1 || app.form_data?.address_line_1,
          pData.p_address_line_2 || app.form_data?.address_line_2,
          pData.p_city || app.form_data?.city,
          pData.p_state || app.form_data?.state,
          pData.p_zip_code || app.form_data?.zip_code,
        ]
          .filter(Boolean)
          .join(", ");
        return pAddr || app.form_data?.address || "";
      },
    },
    department: {
      label: "College / Department",
      getValue: (app) => app.courses?.colleges?.name || "N/A",
    },
    course: {
      label: "Course",
      getValue: (app) => app.courses?.name || "",
    },
    branch: {
      label: "Branch",
      getValue: (app) => app.branches?.name || "N/A",
    },
    admission_type: {
      label: "Admission Type",
      getValue: (app) => app.admission_type || "Regular",
    },
    status: {
      label: "Admission Status",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.admission_status || app.status || "Admitted";
      },
    },
    gender: {
      label: "Gender",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.gender || app.form_data?.gender || "";
      },
    },
    category: {
      label: "Category",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.category || app.form_data?.category || "";
      },
    },
    father_name: {
      label: "Father Name",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.father_full_name || app.form_data?.father_name || "";
      },
    },
    father_contact: {
      label: "Father Contact",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.father_contact_number || app.form_data?.father_contact || "";
      },
    },
    mother_name: {
      label: "Mother Name",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.mother_full_name || app.form_data?.mother_name || "";
      },
    },
    admission_no: {
      label: "Admission Number",
      getValue: (app) => {
        const admissions = app.account_admissions;
        const entry = Array.isArray(admissions) ? admissions[0] : admissions;
        return entry?.admission_number || "";
      },
    },
    form_type: {
      label: "Form Type",
      getValue: (app) => app.form_type || "",
    },
    submitted_date: {
      label: "Submitted Date",
      getValue: (app) =>
        app.submitted_at
          ? new Date(app.submitted_at).toISOString().split("T")[0]
          : "",
    },
  };

  // Determine export columns
  let activeKeys = Object.keys(availableFieldMap);
  if (selectedFields && selectedFields.length > 0) {
    const validKeys = selectedFields.filter((k) => availableFieldMap[k]);
    if (validKeys.length > 0) activeKeys = validKeys;
  }

  // Helper to format rows for a given list of applications
  const formatRowsForApps = (appList: any[]) => {
    return appList.map((app: any, idx: number) => {
      const row: Record<string, any> = {
        "Sr. No": idx + 1,
      };
      activeKeys.forEach((key) => {
        const fieldConfig = availableFieldMap[key];
        if (fieldConfig) {
          row[fieldConfig.label] = fieldConfig.getValue(app);
        }
      });
      return row;
    });
  };

  // Helper to sanitize sheet names for SheetJS (max 31 chars, no invalid chars : \ / ? * [ ])
  const sanitizeSheetName = (name: string, defaultName: string) => {
    if (!name) return defaultName;
    const clean = name.replace(/[:\\/?*\[\]]/g, "_").trim();
    return clean.length > 31 ? clean.substring(0, 31) : clean || defaultName;
  };

  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  const getUniqueSheetName = (proposed: string) => {
    let clean = sanitizeSheetName(proposed, "Sheet");
    let count = 1;
    let finalName = clean;
    while (usedSheetNames.has(finalName.toLowerCase())) {
      const suffix = `_${count}`;
      const base = clean.substring(0, 31 - suffix.length);
      finalName = `${base}${suffix}`;
      count++;
    }
    usedSheetNames.add(finalName.toLowerCase());
    return finalName;
  };

  // 1. Summary Sheet (Optional or Default)
  if (includeSummary || sheetMode === "single") {
    const summaryRows = formatRowsForApps(filteredStudents);
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    const sheetName = getUniqueSheetName("All Admitted Students");
    XLSX.utils.book_append_sheet(workbook, summarySheet, sheetName);
  }

  // 2. Individual sheets based on sheetMode
  if (sheetMode === "branch") {
    // Group by Branch
    const branchGroupMap = new Map<string, { branchName: string; apps: any[] }>();

    filteredStudents.forEach((app: any) => {
      const branchId = app.branch_id || "unassigned";
      const branchObj = branchMap.get(branchId);
      const branchName = branchObj ? branchObj.name : app.branches?.name || "Unassigned Branch";

      if (!branchGroupMap.has(branchId)) {
        branchGroupMap.set(branchId, { branchName, apps: [] });
      }
      branchGroupMap.get(branchId)!.apps.push(app);
    });

    // Append a sheet for each branch
    for (const [_, group] of branchGroupMap) {
      const rows = formatRowsForApps(group.apps);
      const sheet = XLSX.utils.json_to_sheet(rows);
      const sheetName = getUniqueSheetName(group.branchName);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }
  } else if (sheetMode === "course") {
    // Group by Course
    const courseGroupMap = new Map<string, { courseName: string; apps: any[] }>();

    filteredStudents.forEach((app: any) => {
      const courseId = app.course_id || "unassigned";
      const courseObj = courseMap.get(courseId);
      const courseName = courseObj ? courseObj.name : app.courses?.name || "Unassigned Course";

      if (!courseGroupMap.has(courseId)) {
        courseGroupMap.set(courseId, { courseName, apps: [] });
      }
      courseGroupMap.get(courseId)!.apps.push(app);
    });

    // Append a sheet for each course
    for (const [_, group] of courseGroupMap) {
      const rows = formatRowsForApps(group.apps);
      const sheet = XLSX.utils.json_to_sheet(rows);
      const sheetName = getUniqueSheetName(group.courseName);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }
  }

  // Generate Excel file buffer
  const excelBuffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `Admitted_Students_Report_${timestamp}.xlsx`;

  return new Response(excelBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
