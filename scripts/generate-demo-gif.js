import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';

// SVG Terminal Frame Generator
function generateTerminalSvg(title, lines, cursor = false) {
  const width = 1200;
  const height = 750;
  const paddingX = 40;
  const startY = 90;
  const lineHeight = 24;

  const renderedLines = lines.map((line, idx) => {
    const y = startY + idx * lineHeight;
    let content = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Color replacements
    content = content
      .replace(/\[CYAN\](.*?)\[\/CYAN\]/g, '<tspan fill="#38bdf8" font-weight="bold">$1</tspan>')
      .replace(/\[GREEN\](.*?)\[\/GREEN\]/g, '<tspan fill="#34d399" font-weight="bold">$1</tspan>')
      .replace(/\[YELLOW\](.*?)\[\/YELLOW\]/g, '<tspan fill="#fbbf24">$1</tspan>')
      .replace(/\[MAGENTA\](.*?)\[\/MAGENTA\]/g, '<tspan fill="#e879f9">$1</tspan>')
      .replace(/\[DIM\](.*?)\[\/DIM\]/g, '<tspan fill="#64748b">$1</tspan>')
      .replace(/\[BOLD\](.*?)\[\/BOLD\]/g, '<tspan fill="#ffffff" font-weight="bold">$1</tspan>');

    return `<text x="${paddingX}" y="${y}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="14" fill="#cbd5e1">${content}</text>`;
  }).join('\n');

  const cursorElement = cursor
    ? `<rect x="${paddingX + 380}" y="${startY - 14}" width="8" height="18" fill="#38bdf8" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" rx="16" fill="#0b0f19" stroke="#1e293b" stroke-width="2" />
  
  <!-- Terminal Header Bar -->
  <rect width="${width}" height="48" rx="16" fill="#0f172a" />
  <rect y="32" width="${width}" height="16" fill="#0f172a" />
  <line x1="0" y1="48" x2="${width}" y2="48" stroke="#1e293b" stroke-width="1.5" />
  
  <!-- Window Control Buttons -->
  <circle cx="28" cy="24" r="6" fill="#f43f5e" />
  <circle cx="48" cy="24" r="6" fill="#fbbf24" />
  <circle cx="68" cy="24" r="6" fill="#10b981" />
  
  <!-- Title -->
  <text x="${width / 2}" y="29" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="12" font-weight="600" fill="#94a3b8" text-anchor="middle">${title}</text>
  
  <!-- Terminal Content -->
  <g>
    ${renderedLines}
    ${cursorElement}
  </g>
</svg>`;
}

async function main() {
  const tmpDir = path.resolve('docs/images/.tmp_frames');
  const imagesDir = path.resolve('docs/images');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  const frames = [
    // Frame 1: Inspect Command Prompt
    {
      title: "alexander@workstation: ~/agentspec",
      lines: [
        "[GREEN]➜[/GREEN] [CYAN]agentspec[/CYAN] [BOLD]inspect[/BOLD] tests/fixtures/petstore.json",
        ""
      ]
    },
    // Frame 2: Inspect Output
    {
      title: "agentspec inspect - Schema Metrics",
      lines: [
        "[GREEN]➜[/GREEN] [CYAN]agentspec[/CYAN] [BOLD]inspect[/BOLD] tests/fixtures/petstore.json",
        "",
        " [CYAN][BOLD]OpenAPI Inspection:[/BOLD][/CYAN] Swagger Petstore (v1.0.0)",
        " [DIM]Sample Petstore API for AgentSpec testing[/DIM]",
        "",
        "┌──────────────────────────────┬──────────────────────────────┐",
        "│ [BOLD]Metric[/BOLD]                       │ [BOLD]Value[/BOLD]                        │",
        "├──────────────────────────────┼──────────────────────────────┤",
        "│ Total Operations             │ 4                            │",
        "│ Total Path Routes            │ 2                            │",
        "│ Original Token Estimate      │ [YELLOW]771[/YELLOW]                          │",
        "│ Pruned Token Estimate        │ [GREEN]385[/GREEN]                          │",
        "│ Estimated Token Savings      │ [CYAN][BOLD]50.1%[/BOLD][/CYAN]                        │",
        "└──────────────────────────────┴──────────────────────────────┘",
        "",
        " [BOLD]Operations Summary:[/BOLD]",
        "┌──────────┬────────────────────────────┬─────────────────────────┬──────────────┬────────┐",
        "│ [BOLD]Method[/BOLD]   │ [BOLD]Path[/BOLD]                       │ [BOLD]Operation ID[/BOLD]            │ [BOLD]Parameters[/BOLD]   │ [BOLD]Body[/BOLD]   │",
        "├──────────┼────────────────────────────┼─────────────────────────┼──────────────┼────────┤",
        "│ [CYAN]GET[/CYAN]      │ /pets                      │ listPets                │ 2            │ [DIM]No[/DIM]     │",
        "│ [GREEN]POST[/GREEN]     │ /pets                      │ createPet               │ 0            │ [GREEN]Yes[/GREEN]    │",
        "│ [CYAN]GET[/CYAN]      │ /pets/{petId}              │ getPetById              │ 1            │ [DIM]No[/DIM]     │",
        "│ [YELLOW]DELETE[/YELLOW]   │ /pets/{petId}              │ deletePet               │ 1            │ [DIM]No[/DIM]     │",
        "└──────────┴────────────────────────────┴─────────────────────────┴──────────────┴────────┘"
      ]
    },
    // Frame 3: Compile Command
    {
      title: "agentspec compile - Multi-Target Compiler",
      lines: [
        "[GREEN]➜[/GREEN] [CYAN]agentspec[/CYAN] [BOLD]compile[/BOLD] tests/fixtures/petstore.json --target all --output ./output",
        "",
        " [CYAN]Compiling specification:[/CYAN] [BOLD]tests/fixtures/petstore.json[/BOLD]",
        " [DIM] Target:       all[/DIM]",
        " [DIM] Output:       ./output[/DIM]",
        " [DIM] Optimization: Token Pruning Enabled (-50.1% reduction)[/DIM]",
        "",
        " [BOLD]Generated Target Artifacts:[/BOLD]",
        "┌────────────────────────────┬──────────────────────────────────────────────────┐",
        "│ [BOLD]Target Artifact[/BOLD]            │ [BOLD]File Path / Description[/BOLD]                          │",
        "├────────────────────────────┼──────────────────────────────────────────────────┤",
        "│ Claude Tools               │ 4 tools -> output/claude-tools.json              │",
        "│ Bedrock Action Group       │ output/bedrock-action-group.json, openapi.json   │",
        "│ AWS CDK (TypeScript)       │ output/bedrock-cdk.ts (CfnAgentActionGroup)      │",
        "│ Terraform HCL              │ output/bedrock.tf (aws_bedrockagent_action_group)│",
        "│ TypeScript & Zod Schemas   │ output/types.ts, output/schemas.ts               │",
        "└────────────────────────────┴──────────────────────────────────────────────────┘",
        "",
        " [GREEN]✓ Compilation finished successfully in ./output[/GREEN]"
      ]
    },
    // Frame 4: Test Fuzzing Command
    {
      title: "agentspec test - Adversarial Schema Fuzzing",
      lines: [
        "[GREEN]➜[/GREEN] [CYAN]agentspec[/CYAN] [BOLD]test[/BOLD] tests/fixtures/petstore.json --handler tests/fixtures/sample-lambda.ts",
        "",
        " [CYAN]AgentSpec Schema Validation & Fuzzing Suite[/CYAN]",
        " [DIM]---------------------------------------------------------[/DIM]",
        "┌────────┬──────────────────────────────────────┬────────────────────┬────────┬────────────┐",
        "│ [BOLD]Status[/BOLD] │ [BOLD]Test Case[/BOLD]                            │ [BOLD]Category[/BOLD]           │ [BOLD]HTTP[/BOLD]   │ [BOLD]Latency[/BOLD]    │",
        "├────────┼──────────────────────────────────────┼────────────────────┼────────┼────────────┤",
        "│ [GREEN] PASS [/GREEN] │ [listPets] Valid Baseline Payload    │ baseline           │ [GREEN]200[/GREEN]    │ 0.54ms     │",
        "│ [GREEN] PASS [/GREEN] │ [listPets] Type Mismatch: limit      │ type_mismatch      │ [YELLOW]400[/YELLOW]    │ 0.29ms     │",
        "│ [GREEN] PASS [/GREEN] │ [listPets] Enum Violation: status    │ enum_violation     │ [YELLOW]400[/YELLOW]    │ 0.76ms     │",
        "│ [GREEN] PASS [/GREEN] │ [listPets] Under Minimum: limit      │ boundary_range     │ [YELLOW]400[/YELLOW]    │ 0.73ms     │",
        "│ [GREEN] PASS [/GREEN] │ [createPet] Valid Baseline Payload   │ baseline           │ [GREEN]201[/GREEN]    │ 1.16ms     │",
        "│ [GREEN] PASS [/GREEN] │ [createPet] Missing Required Body    │ missing_param      │ [YELLOW]400[/YELLOW]    │ 0.69ms     │",
        "│ [GREEN] PASS [/GREEN] │ [createPet] Body Type Mismatch       │ type_mismatch      │ [YELLOW]400[/YELLOW]    │ 0.54ms     │",
        "│ [GREEN] PASS [/GREEN] │ [getPetById] Valid Baseline Payload  │ baseline           │ [GREEN]200[/GREEN]    │ 0.74ms     │",
        "│ [GREEN] PASS [/GREEN] │ [getPetById] Under Minimum: petId    │ boundary_range     │ [YELLOW]400[/YELLOW]    │ 0.44ms     │",
        "│ [GREEN] PASS [/GREEN] │ [deletePet] Missing Required Param   │ missing_param      │ [YELLOW]400[/YELLOW]    │ 0.58ms     │",
        "└────────┴──────────────────────────────────────┴────────────────────┴────────┴────────────┘",
        " [BOLD]Summary:[/BOLD]",
        "   Tests:     [GREEN]18 passed[/GREEN], 0 failed, 18 total",
        "   Pass rate: [GREEN][BOLD]100%[/BOLD][/GREEN]",
        "   Avg time:  0.54ms"
      ]
    },
    // Frame 5: Simulate Command & Studio Active
    {
      title: "agentspec simulate - Bedrock Lambda Fulfillment Emulator",
      lines: [
        "[GREEN]➜[/GREEN] [CYAN]agentspec[/CYAN] [BOLD]simulate[/BOLD] tests/fixtures/petstore.json --handler tests/fixtures/sample-lambda.ts",
        "",
        " [CYAN][BOLD]AgentSpec Bedrock Lambda Emulator Active[/BOLD][/CYAN]",
        " [DIM]---------------------------------------------------------[/DIM]",
        "  [BOLD]Spec File:[/BOLD]     B:\\workgit\\agentspec\\tests\\fixtures\\petstore.json",
        "  [BOLD]Lambda Code:[/BOLD]   B:\\workgit\\agentspec\\tests\\fixtures\\sample-lambda.ts",
        "  [BOLD]Emulator Host:[/BOLD] http://127.0.0.1:5005",
        "  [BOLD]Studio Web UI:[/BOLD] [CYAN]http://127.0.0.1:5005/_studio[/CYAN]",
        " [DIM]---------------------------------------------------------[/DIM]",
        "  [GREEN]Interactive browser studio available at the link above.[/GREEN]",
        "  [DIM]Proxying incoming requests as BedrockLambdaEvent (messageVersion: 1.0)[/DIM]",
        "  [DIM]Hot-reloading local Lambda handler on every incoming request.[/DIM]",
        "",
        " [DIM][2026-10-15 15:50:12][/DIM] [GREEN]HTTP GET[/GREEN] /pets -> Bedrock messageVersion 1.0 fulfillment: [GREEN]200 OK (0.8ms)[/GREEN]",
        " [DIM][2026-10-15 15:50:14][/DIM] [GREEN]HTTP POST[/GREEN] /pets -> Bedrock messageVersion 1.0 fulfillment: [GREEN]201 Created (1.2ms)[/GREEN]"
      ]
    }
  ];

  console.log('Rendering terminal frames to PNG...');
  const pngFiles = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const svg = generateTerminalSvg(f.title, f.lines);
    const pngPath = path.join(tmpDir, `frame_${String(i).padStart(2, '0')}.png`);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    fs.writeFileSync(pngPath, resvg.render().asPng());
    pngFiles.push(pngPath);
  }

  // Also save Frame 4 as high-res terminal screenshot
  const screenshotPath = path.join(imagesDir, 'agentspec_terminal.png');
  fs.copyFileSync(pngFiles[3], screenshotPath);
  console.log(`✓ Saved static screenshot: ${screenshotPath}`);

  // Create duplicate frames for proper pacing in gif
  // frame 0: 1.5s, frame 1: 3s, frame 2: 3s, frame 3: 3.5s, frame 4: 3.5s
  const concatList = [];
  const durations = [1.5, 3.0, 3.0, 3.5, 3.5];

  for (let i = 0; i < pngFiles.length; i++) {
    concatList.push(`file '${pngFiles[i].replace(/\\/g, '/')}'`);
    concatList.push(`duration ${durations[i]}`);
  }
  concatList.push(`file '${pngFiles[pngFiles.length - 1].replace(/\\/g, '/')}'`);

  const concatFilePath = path.join(tmpDir, 'frames.txt');
  fs.writeFileSync(concatFilePath, concatList.join('\n'));

  const gifPath = path.join(imagesDir, 'agentspec_demo.gif');
  console.log('Assembling animated demo GIF via ffmpeg...');

  const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -vf "fps=10,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${gifPath}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  // Clean up tmp directory
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`✓ Successfully generated animated demo GIF: ${gifPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
