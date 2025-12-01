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
    doc = new GoogleSpreadsheet("1j7ykmFK_Y1Xk9eP7JiQjTpduXumaJjqNAspZLbcv584", serviceAccountAuth);
  }
  return doc;
}

module.exports = { getDoc };
export {};