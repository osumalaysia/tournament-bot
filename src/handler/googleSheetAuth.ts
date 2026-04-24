const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const { GOOGLE_SERVICE_TOKEN_JSON } = process.env;

const serviceAccountAuth = new JWT({
    email: JSON.parse(GOOGLE_SERVICE_TOKEN_JSON || "{}").client_email,
    key: JSON.parse(GOOGLE_SERVICE_TOKEN_JSON || "{}").private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

let doc:any;

const getDoc = () => {
  if (!doc) {
    doc = new GoogleSpreadsheet("1Xca3qCtnU_y-B7FTizkrC3XSMja6zDrsCYPeNSo8gNQ", serviceAccountAuth);
  }
  return doc;
}

module.exports = { getDoc };
export {};