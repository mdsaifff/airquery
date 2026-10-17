from pathlib import Path

import duckdb

from catalog import SCENES, build


def run(name: str, csv: str, tmp_path: Path) -> tuple[dict, list[dict]]:
    src = tmp_path / f"{name}.csv"
    src.write_text(csv, encoding="utf-8")
    schema = build(SCENES[name], src, tmp_path)
    rel = duckdb.sql(f"SELECT * FROM '{(tmp_path / f'{name}.parquet').as_posix()}' ORDER BY id")
    return schema, [dict(zip(rel.columns, r, strict=True)) for r in rel.fetchall()]


def test_meteorites_drop_unknown_places_and_group_classes(tmp_path: Path) -> None:
    csv = """name,id,nametype,recclass,mass (g),fall,year,reclat,reclong,GeoLocation
Aachen,1,Valid,L5,21,Fell,1880,50.775,6.08333,x
Gibeon,2,Valid,Iron IAB,26000000,Found,1836,-25.5,18,x
Murchison,3,Valid,CM2,100000,Fell,1969,-36.6,145.2,x
Zagami,4,Valid,Martian (shergottite),18000,Fell,1962,11.7,7.1,x
Abee,5,Valid,EH4,107000,Fell,1952,54.2,-113,x
Nowhere,6,Valid,H5,10,Found,2000,0,0,x
Relic,7,Relict,H5,10,Found,2000,10,10,x
NoMass,8,Valid,H5,,Found,2000,10,10,x
"""
    schema, rows = run("meteorites", csv, tmp_path)
    assert [(r["name"], r["kind"]) for r in rows] == [
        ("Aachen", "ordinary chondrite"),
        ("Gibeon", "iron"),
        ("Murchison", "carbonaceous chondrite"),
        ("Zagami", "martian"),
        ("Abee", "enstatite chondrite"),
    ]
    assert rows[1]["mass_kg"] == 26000 and rows[0]["fall"] == "fell"
    assert (schema["title"], schema["noun"]) == ("meteorite landings", "meteorites")
    kind = next(c for c in schema["columns"] if c["name"] == "kind")
    assert kind["categorical"] and "iron" in kind["examples"]


def test_hurricanes_skip_the_units_row_and_wrap_longitudes(tmp_path: Path) -> None:
    head = "SID,SEASON,NUMBER,BASIN,SUBBASIN,NAME,ISO_TIME,NATURE,LAT,LON,WMO_WIND,WMO_PRES,TRACK_TYPE,USA_WIND,USA_PRES,USA_SSHS"  # noqa: E501
    csv = f"""{head}
 ,Year, , , , , , ,degrees_north,degrees_east,kts,mb, ,kts,mb,1
S1,2024,1,NA,MM,BERYL,2024-07-01 06:00:00,TS,12.0,-60.0,,,main,140,940,4
S1,2024,1,NA,MM,BERYL,2024-07-01 09:00:00,TS,12.1,-60.5,,,main,140,940,4
S2,2024,2,EP,MM,NOT_NAMED,2024-08-01 12:00:00,TS,15.0,257.4,35,1000,main,,,0
S3,2024,3,WP,MM,SPUR,2024-08-01 12:00:00,TS,15.0,130.0,35,1000,spur,,,0
"""
    schema, rows = run("hurricanes", csv, tmp_path)
    assert [(r["storm"], r["basin"], r["lon"], r["wind_kt"]) for r in rows] == [
        ("BERYL", "North Atlantic", -60.0, 140.0),  # the 09:00 point is not a 6-hourly one
        ("UNNAMED", "Eastern Pacific", -102.6, 35.0),  # WMO wind when USA wind is missing
    ]
    time = next(c for c in schema["columns"] if c["name"] == "time")
    assert (time["min"], time["max"]) == ("2024-07-01T06:00:00", "2024-08-01T12:00:00")


def test_corals_thin_to_one_record_per_place_and_kind(tmp_path: Path) -> None:
    csv = """CatalogNumber,latitude,longitude,DepthInMeters,ScientificName,VernacularNameCategory,ObservationYear,Ocean
,degrees_north,degrees_east,m,,,,
1,30.001,-80.001,1500,Lophelia,stony coral (branching),2010,North Atlantic
2,30.002,-80.002,1510,Lophelia,stony coral (branching),2011,North Atlantic
3,30.002,-80.002,1510,Hexactinellida,glass sponge,-999,North Atlantic
4,-40.5,170.2,4200,Bathypathes,black coral,2019,South Pacific
"""  # noqa: E501
    schema, rows = run("corals", csv, tmp_path)
    assert [(r["id"], r["kind"], r["depth_km"], r["year"]) for r in rows] == [
        ("1", "stony coral (branching)", 1.5, 2010),  # record 2 sits in the same ~1 km cell
        ("3", "glass sponge", 1.51, None),
        ("4", "black coral", 4.2, 2019),
    ]
    assert schema["position"]["depth"] == "depth_km"


def test_airports_drop_closed_and_duplicate_entries(tmp_path: Path) -> None:
    csv = """id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,icao_code,iata_code
1,EGLL,large_airport,Heathrow,51.47,-0.45,83,EU,GB,GB-ENG,London,yes,EGLL,LHR
2,SPZO,medium_airport,Cusco,-13.53,-71.93,10860,SA,PE,PE-CUS,Cusco,yes,SPZO,CUZ
3,XX01,closed,Old Field,10,10,5,NA,US,US-TX,,no,,
4,XX02,heliport,[Duplicate] Pad,10,10,,NA,US,US-TX,,no,,
5,XX03,heliport,Roof Pad,40,-74,,NA,US,US-NY,New York,,,
"""  # noqa: E501
    schema, rows = run("airports", csv, tmp_path)
    assert [(r["id"], r["type"], r["elevation_ft"]) for r in rows] == [
        ("EGLL", "large airport", 83.0),
        ("SPZO", "medium airport", 10860.0),
        ("XX03", "heliport", 0.0),
    ]
    assert schema["position"]["height"] == "elevation_ft"


def test_stars_keep_bright_known_stars_and_scale_to_unit_radius(tmp_path: Path) -> None:
    head = "id,hip,hd,hr,gl,bf,proper,ra,dec,dist,pmra,pmdec,rv,mag,absmag,spect,ci,x,y,z,vx,vy,vz,rarad,decrad,pmrarad,pmdecrad,bayer,flam,con"  # noqa: E501
    csv = f"""{head}
0,,,,,,Sol,0,0,0,0,0,0,-26.7,4.85,G2V,0.65,0,0,0,0,0,0,0,0,0,0,,,
1,32349,,,,,Sirius,0,0,2.64,0,0,0,-1.44,1.45,A0m...,0,2.64,0,0,0,0,0,0,0,0,0,Alp,9,CMa
2,100,,,,,,0,0,100,0,0,0,5.0,1.0,M3III,0,0,100,0,0,0,0,0,0,0,0,Eta,,Ori
3,200,,,,,,0,0,100000,0,0,0,6.0,1.0,K0,0,0,0,100000,0,0,0,0,0,0,0,,,
4,300,,,,,,0,0,50,0,0,0,9.5,1.0,K0,0,0,0,50,0,0,0,0,0,0,0,,,
"""  # noqa: E501
    schema, rows = run("stars", csv, tmp_path)
    assert [(r["name"], r["spectral_class"]) for r in rows] == [
        ("Sol", "G"),
        ("Sirius", "A"),
        ("Eta Ori", "M"),  # no proper name: Bayer letter + constellation
    ]
    radii = [(r["x"] ** 2 + r["y"] ** 2 + r["z"] ** 2) ** 0.5 for r in rows]
    assert radii[0] == 0 and 0.9 < max(radii) < 1.1  # Sun at the centre, far stars near 1
    assert schema["position"]["kind"] == "xyz"
