"""Download and extract the official Argos English -> Chinese CTranslate2 model."""
import argparse
import hashlib
import json
import urllib.request
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--destination", default=str(Path(__file__).parent / "models"))
args = parser.parse_args()
destination = Path(args.destination).resolve()
destination.mkdir(parents=True, exist_ok=True)
archive = destination / "translate-en_zh-1_9.argosmodel"
url = "https://data.argosopentech.com/argospm/v1/translate-en_zh-1_9.argosmodel"
expected_sha256 = "433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab"
if not archive.exists():
    temporary = archive.with_suffix(".download")
    print("Downloading official English-Chinese model...", flush=True)
    urllib.request.urlretrieve(url, temporary)
    temporary.replace(archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected_sha256:
    raise RuntimeError("Model checksum mismatch; remove the archive and download it again")
with zipfile.ZipFile(archive) as package:
    for member in package.infolist():
        target = (destination / member.filename).resolve()
        if not target.is_relative_to(destination):
            raise ValueError("Invalid model archive path")
    package.extractall(destination)
folders = [folder for folder in destination.iterdir() if folder.is_dir() and (folder / "model/model.bin").is_file()]
if len(folders) != 1:
    raise RuntimeError("Expected one model directory")
manifest = {"directory": str(folders[0]), "source": url, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}
(destination / "model-info.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps(manifest, indent=2), flush=True)
