import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

function buildLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <clipPath id="squircle-clip">
      <rect x="24" y="24" width="976" height="976" rx="220" />
    </clipPath>

    <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f5ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <linearGradient id="cyan-glow-rev" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#00f5ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <linearGradient id="amber-accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>

    <filter id="subtle-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.14" />
    </filter>
  </defs>

  <!-- Luxury White Squircle Container -->
  <rect x="24" y="24" width="976" height="976" rx="220" fill="#ffffff" stroke="#e2e8f0" stroke-width="6" />

  <g clip-path="url(#squircle-clip)">
    <g transform="translate(512, 512)" filter="url(#subtle-shadow)">

      <!-- Hexagonal Architectural Gateway -->
      <polygon points="
        0,-390
        338,-195
        338,195
        0,390
        -338,195
        -338,-195
      " fill="none" stroke="#0f172a" stroke-width="40" stroke-linejoin="round" />

      <polygon points="
        0,-355
        307,-177
        307,177
        0,355
        -307,177
        -307,-177
      " fill="none" stroke="#00f5ff" stroke-width="4" opacity="0.4" stroke-dasharray="16, 12" />

      <!-- Symmetrical Origami Mascot: Athena Owl (Precision Schema Architect) -->

      <!-- 1. Watertight Solid Base Silhouette -->
      <path d="
        M 0 -290
        L 90 -230
        L 140 -270
        L 130 -160
        L 210 -80
        L 230 40
        L 190 190
        L 110 280
        L 0 310
        L -110 280
        L -190 190
        L -230 40
        L -210 -80
        L -130 -160
        L -140 -270
        L -90 -230
        Z
      " fill="#0b0f19" />

      <!-- 2. Ear Tufts & Crown Armor (Polygonal Facets) -->
      <!-- Left Ear Tuft -->
      <polygon points="0,-290 -90,-230 -140,-270 -110,-190" fill="#1e293b" />
      <polygon points="-140,-270 -130,-160 -110,-190" fill="#334155" />
      <!-- Right Ear Tuft (Symmetrical) -->
      <polygon points="0,-290 90,-230 140,-270 110,-190" fill="#0f172a" />
      <polygon points="140,-270 130,-160 110,-190" fill="#1e293b" />

      <!-- Crown Center Brow -->
      <polygon points="0,-290 -60,-200 0,-170 60,-200" fill="#334155" />
      <polygon points="0,-170 -60,-200 -90,-230 0,-290" fill="#1e293b" />
      <polygon points="0,-170 60,-200 90,-230 0,-290" fill="#475569" />

      <!-- 3. Facial Disk & Brow Plates -->
      <!-- Left Disk -->
      <polygon points="0,-170 -60,-200 -120,-110 -50,-90 0,-110" fill="#1e293b" />
      <polygon points="-50,-90 -120,-110 -150,-10 -60,-30 0,-70" fill="#0f172a" />
      <!-- Right Disk (Symmetrical) -->
      <polygon points="0,-170 60,-200 120,-110 50,-90 0,-110" fill="#334155" />
      <polygon points="50,-90 120,-110 150,-10 60,-30 0,-70" fill="#1e293b" />

      <!-- 4. Electric Cyan Optics (Intelligent Predator Gaze) -->
      <!-- Left Eye Socket -->
      <polygon points="-40,-100 -95,-100 -115,-55 -80,-40 -35,-55" fill="#0b0f19" stroke="#00f5ff" stroke-width="2" />
      <polygon points="-48,-85 -85,-85 -100,-60 -75,-50 -45,-60" fill="url(#cyan-glow)" />
      <polygon points="-65,-80 -78,-60 -65,-55" fill="#ffffff" />

      <!-- Right Eye Socket (Symmetrical) -->
      <polygon points="40,-100 95,-100 115,-55 80,-40 35,-55" fill="#0b0f19" stroke="#00f5ff" stroke-width="2" />
      <polygon points="48,-85 85,-85 100,-60 75,-50 45,-60" fill="url(#cyan-glow-rev)" />
      <polygon points="65,-80 78,-60 65,-55" fill="#ffffff" />

      <!-- 5. Central Beak / Schema Compiler Prism -->
      <polygon points="0,-70 -25,-30 0,40" fill="#f59e0b" />
      <polygon points="0,-70 25,-30 0,40" fill="#d97706" />
      <polygon points="0,-70 0,40 0,55" stroke="#00f5ff" stroke-width="3" />

      <!-- 6. Folded Wing Armor & Chest Plates -->
      <!-- Left Upper Wing Facets -->
      <polygon points="-130,-160 -210,-80 -150,-10 -110,-60" fill="#1e293b" />
      <polygon points="-210,-80 -230,40 -170,50 -150,-10" fill="#0f172a" />
      <polygon points="-230,40 -190,190 -140,130 -170,50" fill="#1e293b" />
      <polygon points="-190,190 -110,280 -90,170 -140,130" fill="#0b0f19" />

      <!-- Right Upper Wing Facets (Symmetrical) -->
      <polygon points="130,-160 210,-80 150,-10 110,-60" fill="#334155" />
      <polygon points="210,-80 230,40 170,50 150,-10" fill="#1e293b" />
      <polygon points="230,40 190,190 140,130 170,50" fill="#334155" />
      <polygon points="190,190 110,280 90,170 140,130" fill="#1e293b" />

      <!-- Chest Keel & Core Prism -->
      <polygon points="0,40 -70,30 -60,120 0,160" fill="#1e293b" />
      <polygon points="0,40 70,30 60,120 0,160" fill="#334155" />
      <polygon points="0,160 -60,120 -90,170 -50,240 0,270" fill="#0f172a" />
      <polygon points="0,160 60,120 90,170 50,240 0,270" fill="#1e293b" />

      <!-- Central Core Nexus Diamond -->
      <polygon points="0,60 -30,105 0,150 30,105" fill="#0b0f19" stroke="#00f5ff" stroke-width="4" />
      <polygon points="0,75 -18,105 0,135 18,105" fill="url(#cyan-glow)" opacity="0.85" />

      <!-- Lower Tail Feathers -->
      <polygon points="0,270 -50,240 -30,300 0,310" fill="#1e293b" />
      <polygon points="0,270 50,240 30,300 0,310" fill="#334155" />

    </g>
  </g>
</svg>`;
}

async function renderLogo() {
  const imagesDir = path.resolve('docs/images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const svg = buildLogoSvg();
  const svgPath = path.join(imagesDir, 'logo.svg');
  const pngPath = path.join(imagesDir, 'logo.png');

  fs.writeFileSync(svgPath, svg, 'utf8');

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } });
  const pngData = resvg.render().asPng();
  fs.writeFileSync(pngPath, pngData);

  console.log('✓ Successfully rendered docs/images/logo.svg and docs/images/logo.png');
}

renderLogo().catch(err => {
  console.error('Failed to render logo:', err);
  process.exit(1);
});
