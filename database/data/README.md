# `database/data/` — datos cartográficos de origen

Insumos de terceros a partir de los cuales se generan las migraciones de
geografía. Las licencias están en [`NOTICE`](./NOTICE) — leerlo antes de
publicar el repositorio o de exponer estos límites por una API pública.

---

## `santa-elena-parroquias.geojson`

Las 11 parroquias de la provincia de Santa Elena, Ecuador.

| | |
|---|---|
| Fuente | OpenStreetMap, vía API de Overpass |
| Licencia | ODbL 1.0 — © OpenStreetMap contributors |
| Extraído | 2026-08-25 |
| SRS | EPSG:4326 (nativo de OSM — sin reproyección) |
| Geometría | `MultiPolygon`, las 11 válidas según `ST_IsValid` |
| SHA-256 | `91632decab7ba059abff45cc08136f1bb836b9d361e2d7ece71d59effcccbda0` |

### Reproducción

```bash
cat > q.overpassql <<'EOF'
[out:json][timeout:300];
area["ISO3166-2"="EC-SE"]->.se;
rel(area.se)["boundary"="administrative"]["admin_level"="8"];
out geom;
EOF

curl -s -X POST --data-urlencode "data@q.overpassql" \
  https://overpass-api.de/api/interpreter -o raw-osm.json

python3 osm-parroquias-to-geojson.py   # lee raw-osm.json, escribe el .geojson
```

`osm-parroquias-to-geojson.py` está en este mismo directorio. Encadena los
*ways* de cada relación en anillos cerrados (Overpass los devuelve sueltos y
en orden arbitrario) y **aborta ruidosamente si un anillo no cierra** — un
borde incompleto produciría un polígono silenciosamente equivocado.

No hace falta GDAL/`ogr2ogr`: OSM ya viene en WGS84 y la salida se promueve a
`MultiPolygon` en el propio script.

### Propiedades por *feature*

| Propiedad | Ejemplo | Notas |
|---|---|---|
| `code` | `EC-24-01-54` | convención del proyecto; `left(code,8)` es el cantón padre |
| `dpa` | `240154` | código DPA de 6 dígitos del INEC |
| `name` | `Manglaralto` | prefijo `"Parroquia "` de OSM normalizado |
| `osm_relation` | `1234567` | trazabilidad hacia el origen |

El `code` deriva del tag `municipality_code` de OSM (`24-01-54`), que los
contribuyentes ya mantienen alineado con la codificación DPA del INEC.

### Cobertura

| Cantón | Parroquias |
|---|---|
| `EC-24-01` Santa Elena | Santa Elena, Atahualpa, Colonche, Chanduy, Manglaralto, Simón Bolívar, San José de Ancón (**7**) |
| `EC-24-02` La Libertad | La Libertad (**1**) |
| `EC-24-03` Salinas | Salinas, Anconcito, José Luis Tamayo (**3**) |

---

## Medición de R21.3 — pertenencia parroquia↔cantón

Ejecutada el 2026-08-25 sobre PostGIS 3.4, cruzando estas parroquias contra
los polígonos de cantón reales que siembra `0003_seed_geo_zones.sql`.

Las dos fuentes son distintas: las parroquias son de OSM, los cantones de
[`pabl-o-ce/Ecuador-geoJSON`](https://github.com/pabl-o-ce/Ecuador-geoJSON)
vía la migración `0003`, que es inmutable. Distinta generalización, distinta
fecha.

| `code` | Parroquia | `parent_ok` | `overlap_ratio` | `strict_within` |
|---|---|---|---|---|
| `EC-24-03-51` | Anconcito | ✅ | **0.8058** | ❌ |
| `EC-24-02-50` | La Libertad | ✅ | 0.8764 | ❌ |
| `EC-24-01-54` | Manglaralto | ✅ | 0.9495 | ❌ |
| `EC-24-01-53` | Chanduy | ✅ | 0.9718 | ❌ |
| `EC-24-01-52` | Colonche | ✅ | 0.9931 | ❌ |
| `EC-24-03-50` | Salinas | ✅ | 0.9942 | ❌ |
| `EC-24-01-55` | Simón Bolívar | ✅ | 0.9960 | ❌ |
| `EC-24-01-50` | Santa Elena | ✅ | 0.9983 | ❌ |
| `EC-24-03-52` | José Luis Tamayo | ✅ | 0.9983 | ❌ |
| `EC-24-01-51` | Atahualpa | ✅ | 0.9989 | ❌ |
| `EC-24-01-56` | San José de Ancón | ✅ | 0.9993 | ❌ |

### Lectura

**`strict_within` es `false` en las 11.** La formulación original de R21.3
—`ST_Within(parroquia, canton)`, con o sin buffer— habría fallado en todas
las filas. El buffer necesario para absorber el desfase entre fuentes habría
tenido que crecer hasta dejar de distinguir "borde generalizado" de "cantón
equivocado".

**`parent_ok` es `true` en las 11.** El punto interior de cada parroquia cae
dentro del cantón que declara como padre. Esta prueba es binaria y no lleva
constante: un `false` es una parroquia mal emparentada, no un umbral mal
elegido.

**`OVERLAP_MIN = 0.75`**, fijado por debajo del mínimo observado (0.8058,
Anconcito) con margen deliberado. Detecta corrupción gruesa de geometría —
un polígono cargado a otra escala o desplazado quedaría muy por debajo— sin
ser sensible al desacuerdo de bordes entre fuentes.

Los valores bajos son costeros (Anconcito, La Libertad): el recorte de la
línea de costa difiere entre ambas fuentes. Es artefacto de generalización,
no error de carga — lo confirma que `parent_ok` pasa en ambos.

### Control negativo

GeoReporta ubicaba Anconcito bajo el cantón Santa Elena
(`EC-24-01-02` en su `EcuadorLocationSeeder`). Anconcito pertenece al cantón
**Salinas**. La prueba lo detecta:

| Caso | `parent_ok` |
|---|---|
| Anconcito → cantón Salinas (correcto) | ✅ `true` |
| Anconcito → cantón Santa Elena (error de GeoReporta) | ❌ `false` |

Ese es exactamente el defecto para el que existe R21.3.
