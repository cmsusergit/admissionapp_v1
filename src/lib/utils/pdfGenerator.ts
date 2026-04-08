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
  }>;
  university: {
    name: string;
    logoUrl?: string;
    address?: string;
    contactEmail?: string;
  };
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function createReceiptContent(data: ReceiptData, copyLabel: string): any[] {
  const isPartial = data.totalStructureFee > data.amount;
  const balanceDue = Math.max(0, data.totalStructureFee - data.amount);
  const hasBreakdown = data.feeBreakdown && data.paymentType === "tuition_fee";

  const institutionColumns: any[] = [];
  
  if (data.university.logoUrl) {
    institutionColumns.push({
      width: 50,
      image: data.university.logoUrl,
      margin: [0, 0, 10, 0]
    });
  }

  institutionColumns.push({
    width: "*",
    stack: [
      {
        text: data.university.name || "Institution Name",
        style: "universityName",
      },
      { text: data.university.address || "", style: "universityAddress" },
      {
        text: data.university.contactEmail || "",
        style: "universityAddress",
      },
    ]
  });

  const content: any[] = [
    { text: copyLabel, style: "copyLabel" },
    {
      columns: institutionColumns,
      margin: [0, 0, 0, 5],
    },
    {
      text: "FEE RECEIPT",
      style: "receiptTitle",
      alignment: "center",
      margin: [0, 10, 0, 10],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 1,
          lineColor: "#cccccc",
        },
      ],
      margin: [0, 0, 0, 10],
    },
  ];

  // Add Receipt Metadata Row
  content.push({
    columns: [
      {
        text: `Receipt No: ${data.receiptNumber || data.transactionId || "PENDING"}`,
        style: "info",
        bold: true
      },
      {
        text: `Date: ${formatDate(data.date)}`,
        style: "info",
        alignment: "right"
      }
    ],
    margin: [0, 0, 0, 10]
  });

  if (hasBreakdown) {
    content.push({
      columns: [
        {
          width: "50%",
          stack: [
            { text: "Student Details", style: "sectionHeader" },
            { text: `Name: ${data.studentName}`, style: "info" },
            { text: `Email: ${data.email}`, style: "info" },
          ],
        },
        {
          width: "50%",
          stack: [
            { text: "Admission Details", style: "sectionHeader" },
            ...(data.enrollmentNumber
              ? [
                  {
                    text: `College ID: ${data.enrollmentNumber}`,
                    style: "info",
                  },
                  {
                    text: `Adm No: ${data.admissionNumber || "N/A"}`,
                    style: "info",
                  },
                ]
              : [
                  {
                    text: `Prov Adm ID: ${data.admissionNumber || data.provisionalAdmissionId || "N/A"}`,
                    style: "info",
                  },
                ]),
            { text: `Course: ${data.courseName}`, style: "info" },
            ...(data.branchName
              ? [{ text: `Branch: ${data.branchName}`, style: "info" }]
              : []),
          ],
        },
      ],
      margin: [0, 0, 0, 10],
    });

    content.push({
      columns: [
        {
          width: "50%",
          stack: [
            { text: "Payment Details", style: "sectionHeader" },
            {
              table: {
                widths: ["*"],
                body: [
                  [
                    {
                      text: data.paymentType.replace("_", " ").toUpperCase(),
                      bold: true,
                    },
                  ],
                  ...(data.transactionId
                    ? [
                        [
                          {
                            text: `Ref: ${data.transactionId}`,
                            style: "smallText",
                            color: "#666",
                          },
                        ],
                      ]
                    : []),
                  [{ text: "AMOUNT PAID", alignment: "right" }],
                  [
                    {
                      text: formatCurrency(data.amount),
                      alignment: "right",
                      bold: true,
                      fontSize: 14,
                    },
                  ],
                  ...(isPartial
                    ? [
                        [
                          {
                            text: "Balance Due",
                            alignment: "right",
                            color: "#dc3545",
                          },
                        ],
                        [
                          {
                            text: formatCurrency(balanceDue),
                            alignment: "right",
                            bold: true,
                            color: "#dc3545",
                          },
                        ],
                      ]
                    : []),
                ],
              },
              layout: "noBorders",
            },
          ],
        },
        {
          width: "50%",
          stack: [
            { text: "Fee Structure Breakdown", style: "sectionHeader" },
            ...data.feeBreakdown!.flatMap((section) => [
              ...(section.name
                ? [
                    {
                      text: section.name,
                      style: "sectionLabel",
                      fillColor: "#f0f0f0",
                    },
                  ]
                : []),
              ...(section.items || []).map((item) => ({
                columns: [
                  { text: item.name, width: "*" },
                  {
                    text: formatCurrency(item.amount),
                    width: 80,
                    alignment: "right",
                  },
                ],
                margin: [0, 2, 0, 2] as [number, number, number, number],
              })),
            ]),
            ...(isPartial
              ? [
                  {
                    columns: [
                      { text: "Total Fee", width: "*", bold: true },
                      {
                        text: formatCurrency(data.totalStructureFee),
                        width: 80,
                        alignment: "right",
                        bold: true,
                      },
                    ],
                    margin: [0, 6, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
          ],
        },
      ],
      margin: [0, 0, 0, 10],
    });
  } else {
    content.push({
      columns: [
        {
          width: "50%",
          stack: [
            { text: "Student Details", style: "sectionHeader" },
            { text: `Name: ${data.studentName}`, style: "info" },
            { text: `Email: ${data.email}`, style: "info" },
          ],
        },
        {
          width: "50%",
          stack: [
            { text: "Admission Details", style: "sectionHeader" },
            ...(data.enrollmentNumber
              ? [
                  {
                    text: `College ID: ${data.enrollmentNumber}`,
                    style: "info",
                  },
                  {
                    text: `Adm No: ${data.admissionNumber || "N/A"}`,
                    style: "info",
                  },
                ]
              : [
                  {
                    text: `Prov Adm ID: ${data.admissionNumber || data.provisionalAdmissionId || "N/A"}`,
                    style: "info",
                  },
                ]),
            { text: `Course: ${data.courseName}`, style: "info" },
            ...(data.branchName
              ? [{ text: `Branch: ${data.branchName}`, style: "info" }]
              : []),
          ],
        },
      ],
      margin: [0, 0, 0, 10],
    });

    content.push({
      table: {
        widths: ["*", 120],
        body: [
          [
            { text: "Description", style: "tableHeader" },
            { text: "Amount", style: "tableHeader", alignment: "right" },
          ],
          [
            {
              stack: [
                {
                  text: data.paymentType.replace("_", " ").toUpperCase(),
                  bold: true,
                },
                ...(data.transactionId
                  ? [
                      {
                        text: `Ref: ${data.transactionId}`,
                        style: "smallText",
                        color: "#666",
                      },
                    ]
                  : []),
              ],
            },
            {
              text: formatCurrency(data.amount),
              alignment: "right",
              bold: true,
            },
          ],
          ...(isPartial
            ? [
                [
                  {
                    text: "Balance Due",
                    alignment: "right",
                    bold: true,
                    color: "#dc3545",
                  },
                  {
                    text: formatCurrency(balanceDue),
                    alignment: "right",
                    bold: true,
                    color: "#dc3545",
                  },
                ],
              ]
            : []),
        ],
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 10],
    });
  }

  if (data.paymentModes && data.paymentModes.length > 0) {
    content.push({
      text: "Transaction Details",
      style: "sectionHeader",
      margin: [0, 0, 0, 5],
    });

    const modesTableBody: any[] = [
      [
        { text: "Mode", style: "tableHeader" },
        { text: "Reference", style: "tableHeader" },
        { text: "Amount", style: "tableHeader", alignment: "right" },
      ],
    ];

    data.paymentModes.forEach((mode) => {
      modesTableBody.push([
        { text: mode.mode.charAt(0).toUpperCase() + mode.mode.slice(1) },
        { text: mode.ref || "-" },
        { text: formatCurrency(mode.amount), alignment: "right" },
      ]);
    });

    content.push({
      table: {
        widths: ["auto", "*", 100],
        body: modesTableBody,
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 10],
    });
  }

  content.push({
    text: "This is a computer-generated receipt and does not require a signature.",
    style: "footer",
    alignment: "center",
    margin: [0, 20, 0, 0],
  });

  return content;
}

function buildReceiptDocument(data: ReceiptData, filename?: string): void {
  const styles: any = {
    copyLabel: {
      fontSize: 10,
      bold: true,
      color: "#666",
      alignment: "center",
      margin: [0, 0, 0, 5],
    },
    universityName: { fontSize: 16, bold: true },
    universityAddress: { fontSize: 9, color: "#666" },
    receiptTitle: { fontSize: 13, bold: true, alignment: "right" },
    receiptInfo: { fontSize: 9, alignment: "right" },
    sectionHeader: { fontSize: 11, bold: true, margin: [0, 0, 0, 4], color: "#333", background: "#f8f9fa" },
    info: { fontSize: 10, margin: [0, 2, 0, 0] },
    tableHeader: { fontSize: 10, bold: true, fillColor: "#f5f5f5" },
    sectionLabel: { fontSize: 9, italics: true, color: "#666" },
    smallText: { fontSize: 8, color: "#666" },
    footer: { fontSize: 9, color: "#999", italics: true },
  };

  const officeCopy = createReceiptContent(data, "OFFICE COPY");
  const studentCopy = createReceiptContent(data, "STUDENT COPY");

  // A4 height is 842. Margins are 40+40 = 80. Available = 762.
  // Each copy gets 381. We use a bit less to avoid overflow issues.
  const copyHeight = 365; 

  const docDefinition: any = {
    pageSize: "A4",
    pageMargins: [40, 30, 40, 30],
    styles,
    content: [
      {
        table: {
          widths: ["*"],
          heights: [copyHeight, copyHeight],
          body: [
            [
              { 
                stack: officeCopy, 
                margin: [0, 0, 0, 0] 
              }
            ],
            [
              { 
                stack: studentCopy, 
                margin: [0, 15, 0, 0] 
              }
            ]
          ]
        },
        layout: {
          hLineWidth: (i: number) => (i === 1 ? 1 : 0),
          vLineWidth: () => 0,
          hLineColor: () => "#aaaaaa",
          hLineStyle: () => ({ dash: { length: 4, space: 2 } }),
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: (i: number) => (i === 0 ? 0 : 10),
          paddingBottom: (i: number) => (i === 0 ? 10 : 0)
        }
      }
    ]
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
