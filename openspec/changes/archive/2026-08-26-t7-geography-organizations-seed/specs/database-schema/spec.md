# Delta for database-schema (T7.9.C/D — Geography + Organizations Seed & Demo/Volume Seeding)

## MODIFIED Requirements

### Requirement: R21 — Datos geográficos y organizaciones semilla

(Previously: anclado a "0039"; solo 4 geo_zones sin parroquias ni `code`; `ST_Within` estricto sin tolerancia documentada)

El sistema DEBE sembrar, mediante `database/migrations/0041_geography_organizations_seed.sql`, al menos una parroquia real por cantón de Santa Elena con jerarquía completa (`level`, `code`, `parent_id`) y la organización `CTE - Santa Elena`. El backfill de `code` en las 4 filas provincia/cantón preexistentes DEBE ejecutarse antes de cualquier INSERT de parroquia, porque `parent_id` se resuelve por subselect sobre `geo_zones.code`. 0041 DEBE ser idempotente: re-ejecutarlo NO DEBE cambiar el conteo de `geo_zones` ni `organizations`. La geometría real (INEC) NO DEBE editarse para forzar contención con el cantón; se usa en su lugar una tolerancia documentada.

```
Scenario R21.0 — El backfill de code precede a las parroquias
  Given  una base con 0040 aplicada, ejecutando 0041 por primera vez
  When   se leen las 4 geo_zones preexistentes tras 0041
  Then   sus code son 'EC-24', 'EC-24-01', 'EC-24-02', 'EC-24-03'
  And    ninguna es NULL

Scenario R21.1 — Las parroquias de Santa Elena quedan sembradas
  Given  una base con 0041 aplicada
  When   se cuentan las geo_zones con level = 'parroquia'
  Then   hay al menos una por cada uno de los 3 cantones (EC-24-01/02/03)
  And    cada una tiene code no nulo y polygon no nulo (MULTIPOLYGON válido)
  And    cada una tiene parent_id apuntando al id de su cantón

Scenario R21.2 — La jerarquía geográfica es consistente
  Given  las geo_zones sembradas por 0041
  When   se recorre parent_id desde cualquier parroquia
  Then   se llega a un cantón y de ahí a la provincia (level='provincia', parent_id NULL)
  And    no existen ciclos en la cadena

Scenario R21.3 — Cada parroquia pertenece geométricamente al cantón que declara como padre
  Given  las geo_zones sembradas por 0041, donde las parroquias vienen de OSM y los cantones de Ecuador-geoJSON (0003) — fuentes distintas, con generalización y fecha distintas
  When   se evalúa ST_Within(ST_PointOnSurface(parroquia.polygon), canton.polygon) por cada par
  Then   el resultado es verdadero en todos los casos
  And    esta comprobación es binaria y NO admite tolerancia: un punto interior de la parroquia no puede caer en otro cantón por diferencias de generalización de bordes, sólo por un emparentamiento equivocado — que es exactamente el defecto que R21.3 existe para detectar
  And    se usa ST_PointOnSurface y no ST_Centroid porque el centroide de un polígono cóncavo puede caer fuera del propio polígono
  When   se evalúa además ST_Area(ST_Intersection(parroquia.polygon, canton.polygon)) / ST_Area(parroquia.polygon) por cada par
  Then   el cociente es >= OVERLAP_MIN en todos los casos, con OVERLAP_MIN = 0.75
  And    ese valor se derivó midiendo contra la geometría real el 2026-08-25 (mínimo observado 0.8058, Anconcito), no se asumió; la tabla completa está en database/data/README.md
  And    el test NO edita ninguna geometría para forzar el resultado; un par que falle se reporta como fallo, no se enmascara

Scenario R21.4 — La organización semilla CTE - Santa Elena queda cargada
  Given  una base con 0041 aplicada
  When   se busca la organización 'CTE - Santa Elena' (forma corta fijada por el operador; el predicado del rollback y la idempotencia del seeder dependen de esta cadena exacta)
  Then   existe exactamente una fila
  And    su zone_id apunta a la geo_zone con code='EC-24-01' (cantón Santa Elena)
  And    su parent_id es NULL

Scenario R21.5 — Re-aplicar 0041 no duplica organizaciones ni zonas
  Given  una base con 0041 ya aplicada
  When   se vuelve a ejecutar el archivo 0041
  Then   el conteo de geo_zones no cambia
  And    el conteo de organizations no cambia
```

### Requirement: R22 — Separación entre datos de referencia y datos de demo

(Previously: cubría solo migraciones/incidentes; se agrega la seeder de usuarios)

El sistema DEBE mantener geografía y organizaciones exclusivamente en migraciones versionadas, y datos de demo/volumen/usuarios exclusivamente en `database/seeds/`, ejecutables vía `db:seed` / `db:seed:mass`. Ambos pipelines DEBEN ser idempotentes.

```
Scenario R22.1 — Ninguna migración inserta incidentes
  Given  los archivos de database/migrations
  When   se buscan sentencias INSERT INTO incidents
  Then   no hay ninguna

Scenario R22.2 — La data de demo vive fuera del pipeline de migraciones
  Given  el repositorio tras el change
  When   se localizan los generadores de incidentes de demo y volumen
  Then   están bajo database/seeds/, no bajo database/migrations/

Scenario R22.3 — El seed de demo es idempotente
  Given  una base con la data de demo ya cargada (npm run db:seed)
  When   se vuelve a ejecutar db:seed
  Then   el conteo de incidentes, usuarios y notificaciones no cambia

Scenario R22.4 — El feed de Redis se reconstruye tras sembrar
  Given  incidentes cargados por el seed de demo, sin pasar por los listeners
  When   se ejecuta rebuild-feed.ts
  Then   el feed de Redis devuelve los mismos incidentes activos que Postgres

Scenario R22.5 — La seeder de usuarios crea la distribución acordada
  Given  una base limpia con 0041 aplicada
  When   se ejecuta database/seeds/users.js
  Then   existen exactamente 6 usuarios: 1 master, 1 operador_sistema, 2 admin_org, 2 operador_org
  And    los 4 usuarios admin_org/operador_org tienen organization_id = CTE - Santa Elena

Scenario R22.6 — La seeder de usuarios es idempotente por email
  Given  el seeder de usuarios ya ejecutado una vez
  When   se vuelve a ejecutar
  Then   el conteo de usuarios permanece en 6, ningún email se duplica
```
