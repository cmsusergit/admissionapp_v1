import pdfMake from "pdfmake/build/pdfmake.js";
import * as pdfFonts from "pdfmake/build/vfs_fonts.js";

(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  studentName: string;
  email: string;
  enrollmentNumber?: string;
  admissionNumber?: string;
  provisionalAdmissionId?: string;
  courseName: string;
  branchName?: string;
  academicYear?: string;
  semester?: string;
  paymentType: string;
  transactionId?: string;
  amount: number;
  totalStructureFee: number;
  feeBreakdown?: Array<{
    name?: string;
    items?: Array<{ name: string; amount: number }>;
  }>;
  paymentModes?: Array<{
    mode: string;
    amount: number;
    ref?: string;
    date?: string;
    bankName?: string;
  }>;
  university: {
    name: string;
    logoUrl?: string;
    address?: string;
    contactEmail?: string;
  };
}

function formatCurrency(amount: any): string {
  if (typeof amount === 'number') {
    return amount.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  if (!amount) return "0";
  // Clean string of everything except numbers, dots, and minus signs
  const clean = String(amount).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return "0";
  return parsed.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function numberToWords(num: number): string {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  let numStr = num.toString();
  if (numStr.length > 9) return 'overflow';
  const n: any = ('000000000' + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return ''; 
  let str = '';
  str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'Crore ' : '';
  str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'Lakh ' : '';
  str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'Thousand ' : '';
  str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1])]) + 'Hundred ' : '';
  str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) + 'Only' : 'Only';
  return str.trim();
}

function createReceiptContent(data: ReceiptData, copyLabel: string): any[] {
  const content: any[] = [];

  // Header
  const headerColumns: any[] = [];
  
  if (data.university.logoUrl) {
    headerColumns.push({
      width: 60,
      image: data.university.logoUrl,
      fit: [50, 50],
    });
  }

  headerColumns.push({
    width: "*",
    stack: [
      { text: data.university.name.toUpperCase(), style: "headerTitle" },
      { text: `Academic Year: ${data.academicYear || "-"}`, style: "subHeader", margin: [0, 5, 0, 0] },
    ],
    alignment: "center",
  });

  content.push({
    columns: headerColumns,
    margin: [0, 0, 0, 15],
  });

  // Metadata Row 1
  content.push({
    columns: [
      { text: `Student ID: ${data.enrollmentNumber || data.admissionNumber || "-"}`, style: "metaText" },
      { text: `Receipt Number: ${data.receiptNumber || "-"}`, style: "metaText", alignment: "right" },
    ],
  });

  // Metadata Row 2
  content.push({
    columns: [
      { text: `Branch Name: ${data.branchName || "-"}`, style: "metaText" },
      { text: `Date: ${formatDate(data.date)}`, style: "metaText", alignment: "right" },
    ],
    margin: [0, 0, 0, 5],
  });

  // Received From
  content.push({ text: "Received From,", style: "metaText", margin: [0, 5, 0, 0] });
  content.push({ text: data.studentName.toUpperCase(), style: "studentName", margin: [0, 2, 0, 5] });

  // Fees Statement
  content.push({
    text: [
      "The Following amount as Fees for the ",
      { text: data.courseName || "Course", bold: true },
      " for a ",
      { text: data.semester || "FIRST SEMESTER", bold: true },
      " ",
      { text: data.academicYear || "", bold: true },
    ],
    style: "metaText",
    margin: [0, 0, 0, 10],
  });

  // Fee Table
  const tableBody: any[][] = [
    [
      { text: "Sr.", style: "tableHeader", alignment: "center" },
      { text: "Particulars", style: "tableHeader" },
      { text: "Fees in Rs.", style: "tableHeader", alignment: "right" },
    ],
  ];

  if (data.feeBreakdown && data.feeBreakdown.length > 0) {
    data.feeBreakdown.forEach((section) => {
      // Section Header row
      if (section.name) {
        tableBody.push([
          { text: "", border: [true, true, true, true] },
          { text: section.name, style: "sectionHeader", border: [true, true, true, true] },
          { text: "", border: [true, true, true, true] },
        ]);
      }

      let sectionSubtotal = 0;
      (section.items || []).forEach((item, idx) => {
        sectionSubtotal += Number(item.amount) || 0;
        tableBody.push([
          { text: idx + 1, alignment: "center" },
          { text: item.name },
          { text: formatCurrency(item.amount), alignment: "right" },
        ]);
      });

      // SubTotal row
      tableBody.push([
        { text: "", border: [true, false, false, true] },
        { text: "SubTotal", style: "subTotalLabel", alignment: "right", border: [false, false, false, true] },
        { text: formatCurrency(sectionSubtotal), style: "subTotalValue", alignment: "right" },
      ]);
    });
  } else {
      // Fallback for simple payment without breakdown
      tableBody.push([
          { text: "1", alignment: "center" },
          { text: data.paymentType.replace('_', ' ').toUpperCase() },
          { text: formatCurrency(data.amount), alignment: "right" }
      ]);
  }

  // Grand Total row
  tableBody.push([
    { text: "", border: [true, true, false, true] },
    { text: "Grand Total in Rs.", style: "grandTotalLabel", alignment: "right", border: [false, true, false, true] },
    { text: formatCurrency(data.amount), style: "grandTotalValue", alignment: "right" },
  ]);

  content.push({
    table: {
      widths: [30, "*", 100],
      body: tableBody,
    },
    margin: [0, 0, 0, 5],
  });

  // Amount in Words
  const totalAmount = typeof data.amount === 'number' ? data.amount : parseFloat(String(data.amount).replace(/[^0-9.-]+/g, '')) || 0;
  content.push({
    text: `In Words: ${numberToWords(totalAmount)}`,
    style: "metaText",
    bold: true,
    margin: [0, 5, 0, 15],
  });

  // Payment Info Grid
  const modes = data.paymentModes || [];
  const cash = modes.find(m => m.mode.toLowerCase() === 'cash');
  const cheque = modes.find(m => m.mode.toLowerCase() === 'cheque' || m.mode.toLowerCase() === 'dd');
  const online = modes.find(m => m.mode.toLowerCase() === 'online');
  const acpc = modes.find(m => m.mode.toLowerCase() === 'acpc');

  content.push({
    table: {
      widths: ["*", "*", "*", "*"],
      body: [
        [
          { text: "CASH", style: "gridHeader" },
          { text: `Amount: ${cash ? formatCurrency(cash.amount) : "0"}`, style: "gridText" },
          { text: "ADVANCE Amount: 0", style: "gridText" },
          { text: "Freeship Amount: 0", style: "gridText" },
        ],
        [
          { text: "DD/Cheque", style: "gridHeader" },
          { text: `Amount: ${cheque ? formatCurrency(cheque.amount) : "0"}`, style: "gridText" },
          { text: `Bank Name: ${cheque?.bankName || "-"}`, style: "gridText" },
          { text: `Ref.: ${cheque?.ref || "-"}  Date: ${cheque?.date ? formatDate(cheque.date) : "-"}`, style: "gridText" },
        ],
        [
          { text: "Online", style: "gridHeader" },
          { text: `Amount: ${online ? formatCurrency(online.amount) : "0"}`, style: "gridText", colSpan: 1 },
          { text: `Reference Number: ${online?.ref || "-"}`, style: "gridText", colSpan: 2 },
          {},
        ],
        [
          { text: "ACPC", style: "gridHeader" },
          { text: `Amount: ${acpc ? formatCurrency(acpc.amount) : "0"}`, style: "gridText" },
          { text: `Rec.Number: ${acpc?.ref || "-"}`, style: "gridText" },
          { text: `Payment Date: ${acpc?.date ? formatDate(acpc.date) : "-"}`, style: "gridText" },
        ],
      ],
    },
    margin: [0, 0, 0, 20],
  });

  // Signature
  content.push({
    stack: [
        { text: "Authorized Signature", style: "metaText", bold: true },
        { text: "SVIT,Vasad", style: "metaText" }
    ],
    alignment: "right",
    margin: [0, 0, 0, 20]
  });

  // Notes
  content.push({
    text: [
        { text: "Note:: ", bold: true },
        "In addition to above tuition fees, candidate shall have to pay the fees of course/institute fixed by the Fees Regulatory Committee as and when declared from the academic year 2025-26\n",
        { text: "Note:: ", bold: true },
        "Rs.5,000/- refundable deposit after Final Semester clear and verification of original Marksheet"
    ],
    style: "noteText"
  });

  return content;
}

function buildReceiptDocument(data: ReceiptData, filename?: string): void {
  const styles: any = {
    headerTitle: { fontSize: 14, bold: true },
    subHeader: { fontSize: 11, bold: true },
    metaText: { fontSize: 10 },
    studentName: { fontSize: 11, bold: true },
    tableHeader: { fontSize: 10, bold: true, fillColor: "#eeeeee", margin: [0, 2, 0, 2] },
    sectionHeader: { fontSize: 10, bold: true, margin: [0, 2, 0, 2] },
    subTotalLabel: { fontSize: 9, bold: true },
    subTotalValue: { fontSize: 9, bold: true },
    grandTotalLabel: { fontSize: 11, bold: true },
    grandTotalValue: { fontSize: 11, bold: true },
    gridHeader: { fontSize: 9, bold: true, fillColor: "#f9f9f9" },
    gridText: { fontSize: 8 },
    noteText: { fontSize: 8, italics: true },
  };

  const content = createReceiptContent(data, "ORIGINAL");

  const docDefinition: any = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    styles,
    content: content,
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);

  if (filename) {
    pdfDoc.download(filename);
  } else {
    pdfDoc.print();
  }
}

export function generateReceiptPDF(data: ReceiptData): void {
  buildReceiptDocument(data);
}

export function downloadReceiptPDF(data: ReceiptData): void {
  const filename = `Receipt_${data.receiptNumber || "Draft"}.pdf`;
  buildReceiptDocument(data, filename);
}
