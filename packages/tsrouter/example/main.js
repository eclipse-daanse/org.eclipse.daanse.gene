import { OrthogonalRouter } from "../src/index.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const nodes = [
  {
    id: "A",
    rect: { x: 50, y: 80, width: 120, height: 60 },
    ports: [
      { id: "A-right", nodeId: "A", side: "right", offset: 0.5 },
      { id: "A-bottom", nodeId: "A", side: "bottom", offset: 0.5 },
    ],
    label: "Node A",
    color: "#0f3460",
  },
  {
    id: "B",
    rect: { x: 380, y: 60, width: 120, height: 60 },
    ports: [
      { id: "B-left", nodeId: "B", side: "left", offset: 0.5 },
      { id: "B-bottom", nodeId: "B", side: "bottom", offset: 0.5 },
    ],
    label: "Node B",
    color: "#0f3460",
  },
  {
    id: "C",
    rect: { x: 200, y: 250, width: 140, height: 70 },
    ports: [
      { id: "C-top", nodeId: "C", side: "top", offset: 0.5 },
      { id: "C-right", nodeId: "C", side: "right", offset: 0.5 },
    ],
    label: "Obstacle C",
    color: "#533483",
  },
  {
    id: "D",
    rect: { x: 600, y: 220, width: 120, height: 60 },
    ports: [
      { id: "D-left", nodeId: "D", side: "left", offset: 0.3 },
      { id: "D-left2", nodeId: "D", side: "left", offset: 0.7 },
      { id: "D-top", nodeId: "D", side: "top", offset: 0.5 },
    ],
    label: "Node D",
    color: "#0f3460",
  },
  {
    id: "E",
    rect: { x: 50, y: 420, width: 120, height: 60 },
    ports: [
      { id: "E-right", nodeId: "E", side: "right", offset: 0.5 },
    ],
    label: "Node E",
    color: "#0f3460",
  },
  {
    id: "F",
    rect: { x: 650, y: 420, width: 120, height: 60 },
    ports: [
      { id: "F-left", nodeId: "F", side: "left", offset: 0.5 },
    ],
    label: "Node F",
    color: "#0f3460",
  },
  {
    id: "G",
    rect: { x: 350, y: 380, width: 100, height: 50 },
    ports: [],
    label: "Blocker",
    color: "#e94560",
  },
];

const connections = [
  { id: "e1", sourcePortId: "A-right", targetPortId: "B-left" },
  { id: "e2", sourcePortId: "A-bottom", targetPortId: "C-top" },
  { id: "e3", sourcePortId: "B-bottom", targetPortId: "D-left" },
  { id: "e4", sourcePortId: "C-right", targetPortId: "D-left2", alternativeTargetPortIds: ["D-top"] },
  { id: "e5", sourcePortId: "E-right", targetPortId: "F-left" },
];

const pathColors = ["#e94560", "#00d2ff", "#50fa7b", "#f1fa8c", "#ff79c6"];

function getOptions() {
  return {
    margin: parseInt(document.getElementById("margin").value),
    allowCrossings: document.getElementById("allowCrossings").checked,
    allowOverlap: document.getElementById("allowOverlap").checked,
    bendPenalty: parseInt(document.getElementById("bendPenalty").value),
  };
}

function runRouter() {
  const opts = getOptions();
  const router = new OrthogonalRouter(opts);

  for (const node of nodes) {
    router.addNode({ id: node.id, rect: node.rect, ports: node.ports });
  }
  for (const conn of connections) {
    router.addConnection(conn);
  }

  return router.route();
}

function draw() {
  const result = runRouter();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid (subtle)
  ctx.strokeStyle = "#1a1a3e";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < canvas.width; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw paths
  for (let i = 0; i < result.paths.length; i++) {
    const path = result.paths[i];
    const color = pathColors[i % pathColors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let j = 0; j < path.points.length; j++) {
      const p = path.points[j];
      if (j === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Draw waypoints
    ctx.fillStyle = color;
    for (const p of path.points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const r = node.rect;
    ctx.fillStyle = node.color;
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.width, r.height, 6);
    ctx.fill();
    ctx.stroke();

    // Label
    ctx.fillStyle = "#eee";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.label, r.x + r.width / 2, r.y + r.height / 2);

    // Draw ports
    for (const port of node.ports) {
      const pos = getPortPos(r, port.side, port.offset);
      ctx.fillStyle = "#ffdd57";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw info: which target port was used (highlight alternatives)
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let infoY = 10;
  for (let i = 0; i < result.paths.length; i++) {
    const path = result.paths[i];
    const conn = connections.find((c) => c.id === path.connectionId);
    const isAlternative = conn && path.targetPortId !== conn.targetPortId;
    const color = pathColors[i % pathColors.length];
    ctx.fillStyle = isAlternative ? "#ffdd57" : color;
    const suffix = isAlternative ? ` [alt: ${path.targetPortId}]` : "";
    ctx.fillText(`${path.connectionId}: → ${path.targetPortId}${suffix}`, 10, infoY);
    infoY += 16;
  }

  // Draw errors
  if (result.errors && result.errors.length > 0) {
    ctx.fillStyle = "#e94560";
    ctx.font = "14px system-ui";
    for (let i = 0; i < result.errors.length; i++) {
      ctx.fillText(
        `Error: ${result.errors[i].connectionId}: ${result.errors[i].message}`,
        10,
        canvas.height - 30 - i * 20
      );
    }
  }
}

function getPortPos(rect, side, offset) {
  switch (side) {
    case "top": return { x: rect.x + rect.width * offset, y: rect.y };
    case "bottom": return { x: rect.x + rect.width * offset, y: rect.y + rect.height };
    case "left": return { x: rect.x, y: rect.y + rect.height * offset };
    case "right": return { x: rect.x + rect.width, y: rect.y + rect.height * offset };
  }
}

// Controls
for (const id of ["allowCrossings", "allowOverlap"]) {
  document.getElementById(id).addEventListener("change", draw);
}
for (const id of ["margin", "bendPenalty"]) {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    document.getElementById(id + "Val").textContent = el.value;
    draw();
  });
}

draw();
