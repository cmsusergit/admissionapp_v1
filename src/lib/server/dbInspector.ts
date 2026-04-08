
// Static definition of the database schema for the Report Builder
// This avoids complex introspection permissions issues.

export interface TableDefinition {
  name: string;
  label: string;
  columns: { name: string; label: string; type: string }[];
  relationships: {
    targetTable: string;
    label: string;
    foreignKey: string;
    type: "one-to-one" | "many-to-one" | "one-to-many";
  }[];
}

export const DB_SCHEMA: Record<string, TableDefinition> = {
  applications: {
    name: "applications",
    label: "Applications",
    columns: [
      { name: "id", label: "ID", type: "uuid" },
      { name: "status", label: "Status", type: "text" },
      { name: "form_type", label: "Form Type", type: "text" },
      { name: "submitted_at", label: "Submitted Date", type: "datetime" },
      { name: "updated_at", label: "Last Updated", type: "datetime" },
      { name: "merit_score", label: "Merit Score", type: "number" },
      { name: "application_fee_status", label: "Fee Status", type: "text" },
      { name: "approval_comment", label: "Approval Comment", type: "text" },
      { name: "rejection_reason", label: "Rejection Reason", type: "text" },
    ],
    relationships: [
      {
        targetTable: "users",
        label: "Student",
        foreignKey: "student_id",
        type: "many-to-one",
      },
      {
        targetTable: "courses",
        label: "Course",
        foreignKey: "course_id",
        type: "many-to-one",
      },
      {
        targetTable: "admission_cycles",
        label: "Cycle",
        foreignKey: "cycle_id",
        type: "many-to-one",
      },
      {
        targetTable: "branches",
        label: "Branch",
        foreignKey: "branch_id",
        type: "many-to-one",
      },
    ],
  },
  users: {
    name: "users",
    label: "Users",
    columns: [
      { name: "id", label: "ID", type: "uuid" },
      { name: "full_name", label: "Full Name", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "role", label: "Role", type: "text" },
    ],
    relationships: [
      {
        targetTable: "student_profiles",
        label: "Profile",
        foreignKey: "student_profiles_user_id_fkey",
        type: "one-to-one",
      },
    ],
  },
  student_profiles: {
    name: "student_profiles",
    label: "Student Profiles",
    columns: [
      { name: "enrollment_number", label: "Enrollment No", type: "text" },
      { name: "admission_status", label: "Admission Status", type: "text" },
      // Add access to profile_data JSON keys? Complex. Just standard columns for now.
    ],
    relationships: [],
  },
  courses: {
    name: "courses",
    label: "Courses",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
    ],
    relationships: [
      {
        targetTable: "colleges",
        label: "College",
        foreignKey: "college_id",
        type: "many-to-one",
      },
    ],
  },
  payments: {
    name: "payments",
    label: "Payments",
    columns: [
      { name: "amount", label: "Amount", type: "number" },
      { name: "payment_type", label: "Type", type: "text" },
      { name: "status", label: "Status", type: "text" },
      { name: "transaction_id", label: "Transaction ID", type: "text" },
      { name: "receipt_number", label: "Receipt No", type: "text" },
      { name: "payment_date", label: "Date", type: "datetime" },
    ],
    relationships: [
      {
        targetTable: "applications",
        label: "Application",
        foreignKey: "application_id",
        type: "many-to-one",
      },
    ],
  },
  branches: {
    name: "branches",
    label: "Branches",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
    ],
    relationships: [
      {
        targetTable: "courses",
        label: "Course",
        foreignKey: "course_id",
        type: "many-to-one",
      },
    ],
  },
  admission_cycles: {
    name: "admission_cycles",
    label: "Admission Cycles",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "end_date", label: "End Date", type: "date" },
    ],
    relationships: [
      {
        targetTable: "academic_years",
        label: "Academic Year",
        foreignKey: "academic_year_id",
        type: "many-to-one",
      },
    ],
  },
  colleges: {
    name: "colleges",
    label: "Colleges",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
    ],
    relationships: [
      {
        targetTable: "universities",
        label: "University",
        foreignKey: "university_id",
        type: "many-to-one",
      },
    ],
  },
  universities: {
    name: "universities",
    label: "Universities",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
    ],
    relationships: [],
  },
  academic_years: {
    name: "academic_years",
    label: "Academic Years",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "end_date", label: "End Date", type: "date" },
    ],
    relationships: [],
  },
};

export function getSchema() {
  return Object.values(DB_SCHEMA);
}
