from PIL import Image

from textures import OUTPUTS, build, water_mask


def test_water_mask_marks_blue_pixels_only():
    img = Image.new("RGB", (3, 1))
    img.putpixel((0, 0), (10, 20, 60))  # deep ocean
    img.putpixel((1, 0), (60, 150, 170))  # shallow sea
    img.putpixel((2, 0), (90, 120, 40))  # land
    mask = water_mask(img)
    assert mask.mode == "L"
    assert [mask.getpixel((x, 0)) for x in range(3)] == [255, 255, 0]


def test_build_writes_every_output_at_its_size(tmp_path):
    raw = {}
    for name, mode in (("day", "RGB"), ("night", "RGB"), ("clouds", "L")):
        p = tmp_path / f"{name}.jpg"
        Image.new(mode, (64, 32), 120).save(p)
        raw[name] = p
    out = tmp_path / "out"
    written = build(raw, out)
    assert sorted(p.name for p in written) == sorted(OUTPUTS)
    for fname, (size, _) in OUTPUTS.items():
        assert Image.open(out / fname).size == size
