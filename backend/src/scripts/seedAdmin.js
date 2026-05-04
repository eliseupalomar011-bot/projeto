const { getDb } = require("../database/db");

getDb()
  .then(() => {
    console.log("Admin seed concluido.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
