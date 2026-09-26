import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_TOKEN_JSON || "{}");
const serviceAccountAuth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const docs = new Map<string, GoogleSpreadsheet>();

export async function getDoc(spreadsheetId: string): Promise<GoogleSpreadsheet> {
  let doc = docs.get(spreadsheetId);
  if (!doc) {
    doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    await doc.loadInfo();
    docs.set(spreadsheetId, doc);
  }
  return doc;
}
