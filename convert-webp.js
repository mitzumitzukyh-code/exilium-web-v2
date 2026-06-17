const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const conversions = [
  { input: 'deploy/assets/fondo2.png', output: 'deploy/assets/fondo2.webp', quality: 85 },
  { input: 'deploy/assets/app-preview-1.png', output: 'deploy/assets/app-preview-1.webp', quality: 85 },
  { input: 'deploy/assets/app-preview-2.png', output: 'deploy/assets/app-preview-2.webp', quality: 85 },
  { input: 'deploy/assets/rbg/deephaul_ravine_tactical.png', output: 'deploy/assets/rbg/deephaul_ravine_tactical.webp', quality: 85 },
  { input: 'deploy/assets/rbg/Deephaul_Ravine.png', output: 'deploy/assets/rbg/Deephaul_Ravine.webp', quality: 85 },
  { input: 'deploy/assets/fondo.png', output: 'deploy/assets/fondo.webp', quality: 85 },
  { input: 'deploy/assets/logo.png', output: 'deploy/assets/logo.webp', quality: 90 },
  { input: 'deploy/assets/og-image.jpg', output: 'deploy/assets/og-image.webp', quality: 85 },
];

// Reward images
for (let i = 1; i <= 7; i++) {
  const name = i === 3 ? 'PB3' : `PB${i}`;
  const file = `deploy/assets/rewards/${name}.png`;
  if (fs.existsSync(file)) {
    conversions.push({ input: file, output: `deploy/assets/rewards/${name}.webp`, quality: 85 });
  }
}
// PB3.2
if (fs.existsSync('deploy/assets/rewards/PB3.2.png')) {
  conversions.push({ input: 'deploy/assets/rewards/PB3.2.png', output: 'deploy/assets/rewards/PB3.2.webp', quality: 85 });
}

let completed = 0;
let failed = 0;

conversions.forEach(({ input, output, quality }) => {
  if (fs.existsSync(output)) {
    console.log(`⏭ ${output} ya existe, saltando...`);
    completed++;
    return;
  }
  sharp(input)
    .webp({ quality })
    .toFile(output, (err) => {
      if (err) {
        console.error(`❌ Error al convertir ${input}:`, err.message);
        failed++;
      } else {
        const inSize = fs.statSync(input).size;
        const outSize = fs.statSync(output).size;
        const saved = ((1 - outSize / inSize) * 100).toFixed(1);
        console.log(`✅ ${output} creado (ahorro: ${saved}%)`);
      }
      completed++;
      if (completed + failed === conversions.length) {
        console.log(`\n=== Resumen: ${completed} convertidas, ${failed} fallos ===`);
      }
    });
});
