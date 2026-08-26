#!/usr/bin/env python3
"""Ensambla relaciones administrativas de OSM en MultiPolygon GeoJSON.

Las relaciones boundary=administrative traen sus miembros (ways) en orden y
direccion arbitrarios. Hay que encadenarlos por extremos coincidentes hasta
cerrar cada anillo. Se falla ruidosamente si un anillo no cierra: un borde
incompleto produciria un poligono silenciosamente equivocado.
"""
import json
import sys
from collections import defaultdict

RAW = 'raw-osm.json'
OUT = 'santa-elena-parroquias.geojson'


def rings_from_ways(ways):
    """Encadena una lista de ways (cada uno lista de (lon,lat)) en anillos cerrados."""
    pending = [list(w) for w in ways if len(w) >= 2]
    rings = []

    while pending:
        chain = pending.pop(0)
        progressed = True
        while chain[0] != chain[-1] and progressed:
            progressed = False
            for i, w in enumerate(pending):
                if w[0] == chain[-1]:
                    chain.extend(w[1:])
                elif w[-1] == chain[-1]:
                    chain.extend(reversed(w[:-1]))
                elif w[-1] == chain[0]:
                    chain = w[:-1] + chain
                elif w[0] == chain[0]:
                    chain = list(reversed(w[1:])) + chain
                else:
                    continue
                pending.pop(i)
                progressed = True
                break
        if chain[0] != chain[-1]:
            raise SystemExit(f'anillo sin cerrar: {len(chain)} puntos, extremos {chain[0]} {chain[-1]}')
        rings.append(chain)
    return rings


def signed_area(ring):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        s += x1 * y2 - x2 * y1
    return s / 2.0


def main():
    data = json.load(open(RAW))
    feats = []

    for el in data['elements']:
        tags = el.get('tags', {})
        mc = tags.get('municipality_code')
        if not mc:
            raise SystemExit(f"relacion {el['id']} sin municipality_code")

        outer_ways, inner_ways = [], []
        for m in el.get('members', []):
            if m.get('type') != 'way' or 'geometry' not in m:
                continue
            pts = [(round(p['lon'], 7), round(p['lat'], 7)) for p in m['geometry']]
            (inner_ways if m.get('role') == 'inner' else outer_ways).append(pts)

        if not outer_ways:
            raise SystemExit(f"relacion {el['id']} sin ways exteriores")

        outers = rings_from_ways(outer_ways)
        inners = rings_from_ways(inner_ways) if inner_ways else []

        # GeoJSON: exteriores antihorario, interiores horario (RFC 7946).
        outers = [r if signed_area(r) > 0 else r[::-1] for r in outers]
        inners = [r if signed_area(r) < 0 else r[::-1] for r in inners]

        # Cada anillo exterior es su propio poligono; los huecos van al primero
        # que los contenga por bounding box (suficiente: no hay huecos anidados
        # entre parroquias distintas).
        polys = [[list(map(list, o))] for o in outers]
        for h in inners:
            hx = [p[0] for p in h]
            hy = [p[1] for p in h]
            for poly in polys:
                ox = [p[0] for p in poly[0]]
                oy = [p[1] for p in poly[0]]
                if min(ox) <= min(hx) and max(ox) >= max(hx) and min(oy) <= min(hy) and max(oy) >= max(hy):
                    poly.append(list(map(list, h)))
                    break

        name = tags.get('name', '').strip()
        if name.lower().startswith('parroquia '):
            name = name[len('parroquia '):].strip()

        feats.append({
            'type': 'Feature',
            'properties': {
                'code': 'EC-' + mc,          # 24-01-54 -> EC-24-01-54
                'dpa': mc.replace('-', ''),  # 24-01-54 -> 240154
                'name': name,
                'osm_relation': el['id'],
            },
            'geometry': {'type': 'MultiPolygon', 'coordinates': polys},
        })

    feats.sort(key=lambda f: f['properties']['code'])
    fc = {'type': 'FeatureCollection', 'features': feats}
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(fc, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        fh.write('\n')

    for f in feats:
        p = f['properties']
        npoly = len(f['geometry']['coordinates'])
        npts = sum(len(r) for poly in f['geometry']['coordinates'] for r in poly)
        print(f"  {p['code']:14} {p['name']:22} poligonos={npoly} puntos={npts}")
    print(f'total: {len(feats)}')


if __name__ == '__main__':
    main()
