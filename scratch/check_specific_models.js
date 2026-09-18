const fs = require('fs');
const path = require('path');

const memPath = path.join(process.cwd(), 'data', 'catalog_memory.json');
const memory = JSON.parse(fs.readFileSync(memPath, 'utf8'));

const modelsToCheck = ['NA352/00', 'NA552/00', 'FW4018E0', 'SL451EUSD', '0413020012', 'FN101EUSTGD'];

modelsToCheck.forEach(m => {
  const found = memory.find(item => item.modelNo === m || item.offerId === m);
  console.log(`Model: ${m} -> ASIN: ${found ? found.asin : 'NOT FOUND'}`);
});
