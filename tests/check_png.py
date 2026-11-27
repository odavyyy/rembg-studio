"""Le um PNG e informa modo, tamanho e distribuicao do canal alpha (JSON)."""
import json, sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
im = Image.open(sys.argv[1])
info = {"format": im.format, "mode": im.mode, "size": list(im.size), "icc": bool(im.info.get("icc_profile"))}
if im.mode == "RGBA":
    h = im.getchannel("A").histogram()
    total = im.width * im.height
    info["transparent"] = sum(h[:6]) / total
    info["opaque"] = sum(h[250:]) / total
print(json.dumps(info))
