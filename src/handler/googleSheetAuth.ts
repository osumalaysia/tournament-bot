const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const { GOOGLE_SERVICE_TOKEN_JSON } = process.env;

const serviceAccountAuth = new JWT({
    email: JSON.parse(GOOGLE_SERVICE_TOKEN_JSON || "{}").client_email,
    key: JSON.parse(GOOGLE_SERVICE_TOKEN_JSON || "{}").private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const docs = new Map<string, any>();

const getDoc = async (spreadsheetId: string) => {
  if (!docs.has(spreadsheetId)) {
    const newDoc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    await newDoc.loadInfo();
    docs.set(spreadsheetId, newDoc);
  }
  return docs.get(spreadsheetId);
}

module.exports = { getDoc };
export {};