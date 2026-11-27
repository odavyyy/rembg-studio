"""Gera as imagens de teste (fotos de exemplo do scikit-image, ja instalado)."""
import os, sys
from PIL import Image
from skimage import data

out = sys.argv[1]
os.makedirs(os.path.join(out, "lote"), exist_ok=True)
astro = Image.fromarray(data.astronaut())
cat = Image.fromarray(data.chelsea())
coffee = Image.fromarray(data.coffee())
astro.save(os.path.join(out, "astronauta.png"))
from PIL import ImageCms

icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
cat.save(os.path.join(out, "com_perfil.jpg"), quality=95, icc_profile=icc)
cat.save(os.path.join(out, "lote", "gato.jpg"), quality=95)
coffee.save(os.path.join(out, "lote", "cafe.webp"), quality=95)
astro.resize((384, 384)).save(os.path.join(out, "lote", "astronauta_p.bmp"))
cat.save(os.path.join(out, "lote", "gato_tiff.tiff"))
astro.resize((6000, 4000), Image.LANCZOS).save(os.path.join(out, "grande_24mp.jpg"), quality=92)
astro.resize((6000, 5000)).save(os.path.join(out, "enorme_30mp.jpg"), quality=80)
Image.new("1", (16001, 16001)).save(os.path.join(out, "acima_de_250mp.png"))
with open(os.path.join(out, "corrompida.png"), "wb") as f:
    f.write(os.urandom(4096))
with open(os.path.join(out, "cortada.jpg"), "wb") as f:
    f.write(open(os.path.join(out, "lote", "gato.jpg"), "rb").read()[:3000])
with open(os.path.join(out, "notas.txt"), "w") as f:
    f.write("nao sou uma imagem")
print("ok")
