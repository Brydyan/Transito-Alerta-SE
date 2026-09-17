/**
 * shapefile-fixture.ts — builds minimal valid shapefile ZIP buffers for e2e tests.
 *
 * Produces a ZIP containing:
 *   *.shp  — ESRI Shapefile binary (Polygon record per feature)
 *   *.dbf  — dBASE III attribute table (NAME + CODE columns)
 *   *.prj  — WGS84 projection string
 *
 * The SHP/DBF structures are intentionally minimal — just enough to satisfy
 * shpjs's parser. Real coordinates are included so PostGIS spatial queries work.
 */

import path from 'path';

// JSZip is a transitive dependency of shpjs — resolved from shpjs's own
// node_modules tree to avoid adding it as a top-level dependency.
const jszipPath = require.resolve('jszip', {
  paths: [path.dirname(require.resolve('shpjs'))],
});
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const JSZip = require(jszipPath) as any;

export interface FixtureFeature {
  name: string;
  code?: string | null;
  /** GeoJSON coordinates for a polygon ring (first ring, closed). */
  coords: [number, number][];
}

/**
 * Valid Ecuador square around a given center point.
 * Generates a 0.1° x 0.1° box — small enough to be comfortably inside
 * Ecuador and non-self-intersecting.
 */
export function ecuadorSquare(
  lat: number,
  lng: number,
  half = 0.05,
): [number, number][] {
  return [
    [lng - half, lat - half],
    [lng + half, lat - half],
    [lng + half, lat + half],
    [lng - half, lat + half],
    [lng - half, lat - half],
  ];
}

/** Three valid canton polygons within Ecuador bounds. */
export const THREE_CANTON_FEATURES: FixtureFeature[] = [
  { name: 'Canton A', code: 'TST-01', coords: ecuadorSquare(-1.5, -79.5) },
  { name: 'Canton B', code: 'TST-02', coords: ecuadorSquare(-1.5, -78.5) },
  { name: 'Canton C', code: 'TST-03', coords: ecuadorSquare(-1.5, -77.5) },
];

// ── SHP binary builder ────────────────────────────────────────────────────────

function writeInt32BE(buf: Buffer, value: number, offset: number) {
  buf.writeInt32BE(value, offset);
}

function writeInt32LE(buf: Buffer, value: number, offset: number) {
  buf.writeInt32LE(value, offset);
}

function writeDoublLE(buf: Buffer, value: number, offset: number) {
  buf.writeDoubleLE(value, offset);
}

/**
 * Build the minimal .shp binary for a list of polygon features.
 * Format: ESRI Shapefile spec §3.1 (file header 100 bytes + variable-length
 * records). Each record contains exactly one ring (no holes).
 */
function buildShpBuffer(features: FixtureFeature[]): Buffer {
  const HEADER_SIZE = 100;
  const records: Buffer[] = [];

  for (let i = 0; i < features.length; i++) {
    const ring = features[i].coords;
    const numPoints = ring.length;

    // Content length in 16-bit words:
    //   4 (shape type) + 32 (bbox) + 4 (numParts) + 4 (numPoints) +
    //   4 (parts[0] = 0) + 16 * numPoints (X,Y pairs)
    const contentBytes = 4 + 32 + 4 + 4 + 4 + 16 * numPoints;
    const contentWords = contentBytes / 2;

    const recHeader = Buffer.allocUnsafe(8);
    writeInt32BE(recHeader, i + 1, 0);        // record number (1-based)
    writeInt32BE(recHeader, contentWords, 4); // content length in 16-bit words

    const content = Buffer.allocUnsafe(contentBytes);
    let off = 0;

    // Shape type: 5 = Polygon
    writeInt32LE(content, 5, off); off += 4;

    // Bounding box
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const xMin = Math.min(...xs);
    const yMin = Math.min(...ys);
    const xMax = Math.max(...xs);
    const yMax = Math.max(...ys);
    writeDoublLE(content, xMin, off); off += 8;
    writeDoublLE(content, yMin, off); off += 8;
    writeDoublLE(content, xMax, off); off += 8;
    writeDoublLE(content, yMax, off); off += 8;

    // NumParts = 1, NumPoints
    writeInt32LE(content, 1, off); off += 4;
    writeInt32LE(content, numPoints, off); off += 4;

    // Parts array: [0]
    writeInt32LE(content, 0, off); off += 4;

    // Points
    for (const [x, y] of ring) {
      writeDoublLE(content, x, off); off += 8;
      writeDoublLE(content, y, off); off += 8;
    }

    records.push(Buffer.concat([recHeader, content]));
  }

  const totalRecordBytes = records.reduce((s, r) => s + r.length, 0);
  const totalFileLengthWords = (HEADER_SIZE + totalRecordBytes) / 2;

  // All feature bboxes for the file header
  const allCoords = features.flatMap((f) => f.coords);
  const fxMin = Math.min(...allCoords.map((p) => p[0]));
  const fyMin = Math.min(...allCoords.map((p) => p[1]));
  const fxMax = Math.max(...allCoords.map((p) => p[0]));
  const fyMax = Math.max(...allCoords.map((p) => p[1]));

  const header = Buffer.allocUnsafe(HEADER_SIZE);
  header.fill(0);
  writeInt32BE(header, 9994, 0);               // File code
  writeInt32BE(header, totalFileLengthWords, 24); // File length (16-bit words)
  writeInt32LE(header, 1000, 28);              // Version
  writeInt32LE(header, 5, 32);                 // Shape type: Polygon
  writeDoublLE(header, fxMin, 36);
  writeDoublLE(header, fyMin, 44);
  writeDoublLE(header, fxMax, 52);
  writeDoublLE(header, fyMax, 60);

  return Buffer.concat([header, ...records]);
}

// ── DBF binary builder ────────────────────────────────────────────────────────

/** Build a minimal dBASE III .dbf with NAME (C, 255) and CODE (C, 32) fields. */
function buildDbfBuffer(features: FixtureFeature[]): Buffer {
  const FIELD_NAME_LEN = 11;
  const RECORD_SIZE = 1 + 255 + 32; // deletion flag + NAME + CODE

  const fields = [
    { name: 'NAME', type: 'C', length: 255 },
    { name: 'CODE', type: 'C', length: 32 },
  ];

  const headerSize = 32 + fields.length * 32 + 1;
  const totalSize = headerSize + features.length * RECORD_SIZE + 1;
  const buf = Buffer.alloc(totalSize, 0);

  let off = 0;

  // Version
  buf[off++] = 3;

  // Date: YY MM DD
  const now = new Date();
  buf[off++] = now.getFullYear() % 100;
  buf[off++] = now.getMonth() + 1;
  buf[off++] = now.getDate();

  // Number of records
  buf.writeUInt32LE(features.length, off); off += 4;

  // Header size
  buf.writeUInt16LE(headerSize, off); off += 2;

  // Record size
  buf.writeUInt16LE(RECORD_SIZE, off); off += 2;

  off += 20; // reserved

  // Field descriptors
  for (const field of fields) {
    const nameBytes = Buffer.alloc(FIELD_NAME_LEN, 0);
    Buffer.from(field.name).copy(nameBytes);
    nameBytes.copy(buf, off); off += FIELD_NAME_LEN;
    buf[off++] = field.type.charCodeAt(0);
    off += 4; // reserved
    buf[off++] = field.length;
    off += 15; // reserved
  }

  // Header terminator
  buf[off++] = 0x0d;

  // Records
  for (const feature of features) {
    buf[off++] = 0x20; // active record flag

    const nameStr = feature.name ?? '';
    const nameBytes = Buffer.alloc(255, 0x20); // space-padded
    Buffer.from(nameStr.slice(0, 255)).copy(nameBytes);
    nameBytes.copy(buf, off); off += 255;

    const codeStr = feature.code ?? '';
    const codeBytes = Buffer.alloc(32, 0x20);
    Buffer.from(codeStr.slice(0, 32)).copy(codeBytes);
    codeBytes.copy(buf, off); off += 32;
  }

  // EOF marker
  buf[off] = 0x1a;

  return buf;
}

// ── PRJ string ────────────────────────────────────────────────────────────────

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a valid shapefile ZIP buffer from the given features.
 * The buffer can be submitted directly as multipart `file` field to
 * `POST /api/geo-zones/import`.
 */
export async function buildShapefileZip(
  features: FixtureFeature[],
  baseName = 'fixture',
): Promise<Buffer> {
  const shpBuf = buildShpBuffer(features);
  const dbfBuf = buildDbfBuffer(features);

  const zip = new JSZip();
  zip.file(`${baseName}.shp`, shpBuf);
  zip.file(`${baseName}.dbf`, dbfBuf);
  zip.file(`${baseName}.prj`, WGS84_PRJ);

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  return zipBuf;
}
