const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

// 1. Encuentra y renombra archivos .scss a .css recursivamente
function renameFilesRecursively(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      renameFilesRecursively(filePath);
    } else if (file.endsWith('.scss')) {
      const newFilePath = filePath.replace(/\.scss$/, '.css');
      fs.renameSync(filePath, newFilePath);
      console.log(`Renombrado: ${filePath} -> ${newFilePath}`);
    }
  });
}

// 2. Encuentra y reemplaza referencias a .scss por .css en archivos .ts y .css
function updateReferencesRecursively(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      updateReferencesRecursively(filePath);
    } else if (file.endsWith('.ts') || file.endsWith('.css')) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Reemplaza '.scss' por '.css' en importaciones y styleUrls
      if (content.includes('.scss')) {
        const updatedContent = content.replace(/\.scss/g, '.css');
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`Referencias actualizadas en: ${filePath}`);
      }
    }
  });
}

console.log('Iniciando migración de .scss a .css...');
try {
  console.log('\n--- Renombrando Archivos ---');
  renameFilesRecursively(directoryPath);
  
  console.log('\n--- Actualizando Referencias ---');
  updateReferencesRecursively(directoryPath);
  
  console.log('\n¡Migración completada con éxito!');
  console.log('\nIMPORTANTE: No olvides actualizar tu archivo angular.json:');
  console.log('1. Cambia "src/styles.scss" a "src/styles.css"');
  console.log('2. Cambia la opción schematics de "style": "scss" a "style": "css"');
} catch (error) {
  console.error('Ocurrió un error durante la migración:', error);
}
