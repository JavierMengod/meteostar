-- Todos los aforos a menos de 90 km de Villastar que publica el Observatorio del Agua (MITECO), fuera de la provincia
-- de Teruel: Rincón de Ademuz, Los Serranos, Serranía y ciudad de Cuenca, Utiel-Requena, Alto Mijares y Palancia.
-- Ríos según el listado de estaciones de aforo de la CHJ; los que no figuran en él, comprobados con OpenStreetMap
-- (Palancia, San Martín, Turia, rambla de la Viuda) y con fuentes publicadas (Reatillo en Buseo; Mijares en El Colmenar, BOE).
INSERT OR IGNORE INTO aforos (slug, nombre, rio, codigo, elemento, confederacion, lat, lon, embalse, regulado_desde, orden, creado) VALUES
  ('ebron-los-santos', 'Ebrón en Los Santos (Castielfabib)', 'Ebrón', '08104', '01961577-59e8-7893-bf45-f72ede2ca4a7', 'Júcar', 40.1081, -1.2886, NULL, NULL, 40, unixepoch()),
  ('turia-zagra', 'Turia en Zagra (Tuéjar)', 'Turia', '08018', '01961577-5967-79a3-b6b5-6c5946e44ab6', 'Júcar', 39.8403, -1.1462, NULL, NULL, 41, unixepoch()),
  ('mijares-entrada-arenos', 'Mijares a la entrada de Arenós', 'Mijares', '08134', '01961577-5a09-7c09-8ac9-3d3981e90c41', 'Júcar', 40.1157, -0.6058, NULL, NULL, 42, unixepoch()),
  ('mijares-salida-arenos', 'Mijares a la salida de Arenós', 'Mijares', '08145', '01961577-5a17-7fba-86ba-97853e9d8c11', 'Júcar', 40.0872, -0.5396, NULL, NULL, 43, unixepoch()),
  ('jucar-venta-juan-romero', 'Júcar en Venta de Juan Romero', 'Júcar', '08126', '01961577-59ff-7175-9577-990f576e1852', 'Júcar', 40.222, -1.8482, NULL, NULL, 44, unixepoch()),
  ('cabriel-pajaroncillo', 'Cabriel en Pajaroncillo', 'Cabriel', '08090', '01961577-59dd-7dc3-b3b9-9c7409cab3b0', 'Júcar', 39.9403, -1.7111, NULL, NULL, 45, unixepoch()),
  ('tuejar-calles', 'Tuéjar en Calles', 'Tuéjar', '08120', '01961577-59fd-7ce0-80a6-abb82e9ae3a6', 'Júcar', 39.7186, -0.9554, NULL, NULL, 46, unixepoch()),
  ('palancia-jerica', 'Palancia en Jérica', 'Palancia', '08148', '01961577-5a1f-74d9-aa1a-a01da7efb6a1', 'Júcar', 39.8941, -0.5453, NULL, NULL, 47, unixepoch()),
  ('san-martin-villora', 'San Martín en Víllora', 'San Martín', '08141', '01961577-5a14-7a3e-b24d-cd30d0786ab0', 'Júcar', 39.7508, -1.5715, NULL, NULL, 48, unixepoch()),
  ('palancia-fuente-del-bano', 'Palancia en la Fuente del Baño (Navajas)', 'Palancia', '08074', '01961577-59cc-7f65-a83e-7017f07eb59e', 'Júcar', 39.8835, -0.5146, NULL, NULL, 49, unixepoch()),
  ('turia-salida-loriguilla', 'Turia a la salida de Loriguilla', 'Turia', '08147', '01961577-5a1c-76b8-8d4d-9bfc501d6d47', 'Júcar', 39.6631, -0.9055, 'loriguilla', NULL, 50, unixepoch()),
  ('cabriel-villora', 'Cabriel en Víllora', 'Cabriel', '08139', '01961577-5a11-77f1-84a2-74b115da35ac', 'Júcar', 39.7387, -1.6349, NULL, NULL, 51, unixepoch()),
  ('ojos-de-moya-camporrobles', 'Ojos de Moya en Camporrobles', 'Ojos de Moya', '08092', '01961577-59df-7467-ae06-ba62f3d1a049', 'Júcar', 39.6708, -1.5623, NULL, NULL, 52, unixepoch()),
  ('guadazaon-huercemes', 'Guadazaón en Huércemes', 'Guadazaón', '08140', '01961577-5a12-780a-ba89-6990c8c25ec8', 'Júcar', 39.7204, -1.7044, NULL, NULL, 53, unixepoch()),
  ('reatillo-salida-buseo', 'Reatillo a la salida de Buseo', 'Reatillo', '08174', '01961577-5a3e-7676-956a-8edbe3febdd0', 'Júcar', 39.5962, -0.94, NULL, NULL, 54, unixepoch()),
  ('reatillo-embalse-buseo', 'Reatillo en el embalse de Buseo', 'Reatillo', '08008', '01961577-5949-77f3-b973-014b851716d4', 'Júcar', 39.5955, -0.9395, NULL, NULL, 55, unixepoch()),
  ('turia-bugarra', 'Turia en Bugarra', 'Turia', '08022', '01961577-5977-72f2-8a1c-7fe78b558cbb', 'Júcar', 39.605, -0.7829, NULL, NULL, 56, unixepoch()),
  ('mijares-salida-sichar', 'Mijares a la salida de Sichar', 'Mijares', '08119', '01961577-59fb-7af5-bb4d-00794b5c8802', 'Júcar', 39.999, -0.2316, NULL, NULL, 57, unixepoch()),
  ('mijares-el-colmenar', 'Mijares en El Colmenar (Onda)', 'Mijares', '08136', '01961577-5a0c-7b3d-945a-22950eba3d63', 'Júcar', 39.9973, -0.2264, NULL, NULL, 58, unixepoch()),
  ('turia-benaguasil', 'Turia en Benaguasil', 'Turia', '08161', '01961577-5a2a-773f-9d0f-d4ef777c1085', 'Júcar', 39.6082, -0.674, NULL, NULL, 59, unixepoch()),
  ('jucar-cuenca', 'Júcar en Cuenca', 'Júcar', '08032', '01961577-599a-7c8e-a0b1-691b4258a5e4', 'Júcar', 40.073, -2.1428, NULL, NULL, 60, unixepoch()),
  ('barranco-santed', 'Barranco de Santed', 'Barranco de Santed', 'ES091_A338', '01a11199-8a01-7d8b-91f4-a03a982bbaef', 'Ebro', 41.0266, -1.5199, NULL, NULL, 61, unixepoch()),
  ('viuda-salida-maria-cristina', 'Rambla de la Viuda a la salida de María Cristina', 'Rambla de la Viuda', '08167', '01961577-5a34-7c86-b968-3c1660eb5369', 'Júcar', 40.0282, -0.1619, NULL, NULL, 62, unixepoch()),
  ('cabriel-salida-contreras', 'Cabriel a la salida de Contreras', 'Cabriel', '08130', '01961577-5a06-709f-9abd-c5c078c3002e', 'Júcar', 39.5304, -1.5058, NULL, NULL, 63, unixepoch()),
  ('magro-requena', 'Magro en Requena', 'Magro', '08060', '01961577-59c5-707c-8272-49f64045ea6a', 'Júcar', 39.4783, -1.1166, NULL, NULL, 64, unixepoch()),
  ('turia-vilamarxant', 'Turia en Vilamarxant', 'Turia', '08165', '01961577-5a31-7ef6-8c20-2d8cc34f5078', 'Júcar', 39.5815, -0.6202, NULL, NULL, 65, unixepoch());
