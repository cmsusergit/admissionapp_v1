// @ts-nocheck
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { applyRoleBasedCollegeFilter } from "$lib/server/security";

export const load = async ({
  url,
  locals: { supabase, getAuthenticatedUser, userProfile },
}: Parameters<PageServerLoad>[0]) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "deo") {
    throw redirect(303, "/login");
  }

  // Fetch simple stats for DEO
  let draftQuery = supabase
    .from("applications")
    .select("id, courses!inner(college_id)", { count: "exact", head: true })
    .eq("status", "draft");
  draftQuery = applyRoleBasedCollegeFilter(
    draftQuery,
    userProfile,
    "applications",
  );
  const { count: draftCount } = await draftQuery;

  let submittedQuery = supabase
    .from("applications")
    .select("id, courses!inner(college_id)", { count: "exact", head: true })
    .eq("status", "submitted");
  submittedQuery = applyRoleBasedCollegeFilter(
    submittedQuery,
    userProfile,
    "applications",
  );
  const { count: submittedCount } = await submittedQuery;

  let verifiedQuery = supabase
    .from("applications")
    .select("id, courses!inner(college_id)", { count: "exact", head: true })
    .eq("status", "verified");
  verifiedQuery = applyRoleBasedCollegeFilter(
    verifiedQuery,
    userProfile,
    "applications",
  );
  const { count: verifiedCount } = await verifiedQuery;

  // Pagination for Incomplete Forms
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const offset = (page - 1) * limit;

  // Fetch incomplete applications (draft or needs_correction)
  let incompleteQuery = supabase
    .from("applications")
    .select(
      `
            id,
            status,
            updated_at,
            form_type,
            users!applications_student_id_fkey (id, full_name, email),
            courses!inner (name, college_id),
            branches (name),
            admission_cycles (name)
        `,
      { count: "exact" },
    )
    .in("status", ["draft", "needs_correction"]);

  incompleteQuery = applyRoleBasedCollegeFilter(
    incompleteQuery,
    userProfile,
    "applications",
  );

  const {
    data: incompleteApplications,
    count: incompleteCount,
    error: incompleteError,
  } = await incompleteQuery
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (incompleteError) {
    console.error("Error fetching incomplete apps:", incompleteError);
  }
  console.log("Incomplete Apps Count:", incompleteCount);
  console.log("Incomplete Apps Data Length:", incompleteApplications?.length);

  // Fetch recent SUBMITTED/VERIFIED applications to list separately
  let recentQuery = supabase
    .from("applications")
    .select(
      `
            id,
            status,
            updated_at,
            form_type,
            users!applications_student_id_fkey (id, full_name, email),
            courses!inner (name, college_id),
            branches (name),
            admission_cycles (name),
            payments (id, status, payment_type, amount)
        `,
    )
    .in("status", [
      "submitted",
      "verified",
      "approved",
      "rejected",
      "cancelled",
      "waitlisted",
    ]);

  recentQuery = applyRoleBasedCollegeFilter(
    recentQuery,
    userProfile,
    "applications",
  );

  const { data: recentApplications, error: recentError } = await recentQuery
    .order("updated_at", { ascending: false })
    .limit(10);

  return {
    stats: {
      draft: draftCount || 0,
      submitted: submittedCount || 0,
      verified: verifiedCount || 0,
    },
    incompleteApplications: incompleteApplications || [],
    recentApplications: recentApplications || [],
    incompleteCount: incompleteCount || 0,
    page,
    limit,
  };
};
