from __future__ import annotations

import argparse
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile, ZipInfo


FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
EXPECTED_ENTRIES = ["index.mjs", "scf_bootstrap"]
SECRET_PATTERN = re.compile(rb"sk-[A-Za-z0-9_-]{20,}")


def zip_info(name: str, mode: int) -> ZipInfo:
    info = ZipInfo(name, FIXED_TIMESTAMP)
    info.create_system = 3
    info.external_attr = mode << 16
    info.compress_type = ZIP_DEFLATED
    return info


def normalized_bootstrap(path: Path) -> bytes:
    content = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    if not content.endswith(b"\n"):
        content += b"\n"
    if not content.startswith(b"#!/bin/bash\n"):
        raise ValueError("scf_bootstrap must start with #!/bin/bash")
    return content


def create_package(bundle: Path, bootstrap: Path, output: Path) -> None:
    bundle_bytes = bundle.read_bytes()
    bootstrap_bytes = normalized_bootstrap(bootstrap)
    if SECRET_PATTERN.search(bundle_bytes) or SECRET_PATTERN.search(bootstrap_bytes):
        raise ValueError("SCF package input contains a secret-shaped value")

    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr(zip_info("index.mjs", 0o100644), bundle_bytes)
        archive.writestr(
            zip_info("scf_bootstrap", 0o100755),
            bootstrap_bytes,
        )


def verify_package(path: Path) -> None:
    try:
        with ZipFile(path, "r") as archive:
            if archive.namelist() != EXPECTED_ENTRIES:
                raise ValueError("SCF package contains unexpected entries")
            bundle = archive.read("index.mjs")
            bootstrap = archive.read("scf_bootstrap")
            bootstrap_mode = archive.getinfo("scf_bootstrap").external_attr >> 16
    except (FileNotFoundError, BadZipFile, KeyError) as error:
        raise ValueError("SCF package is missing or invalid") from error

    if len(bundle) < 10_000:
        raise ValueError("SCF bundle is unexpectedly small")
    if b"\r" in bootstrap or not bootstrap.startswith(b"#!/bin/bash\n"):
        raise ValueError("scf_bootstrap is not normalized")
    if bootstrap_mode & 0o111 == 0:
        raise ValueError("scf_bootstrap is not executable")
    if SECRET_PATTERN.search(bundle) or SECRET_PATTERN.search(bootstrap):
        raise ValueError("SCF package contains a secret-shaped value")


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument("--bundle", type=Path)
    value.add_argument("--bootstrap", type=Path)
    value.add_argument("--output", type=Path)
    value.add_argument("--verify", type=Path)
    return value


def main() -> None:
    arguments = parser().parse_args()
    if arguments.verify is not None:
        if any(
            item is not None
            for item in (
                arguments.bundle,
                arguments.bootstrap,
                arguments.output,
            )
        ):
            raise SystemExit("--verify cannot be combined with build arguments")
        verify_package(arguments.verify)
        print("Verified SCF package")
        return

    if (
        arguments.bundle is None
        or arguments.bootstrap is None
        or arguments.output is None
    ):
        raise SystemExit("--bundle, --bootstrap, and --output are required")
    create_package(
        arguments.bundle,
        arguments.bootstrap,
        arguments.output,
    )
    verify_package(arguments.output)
    print("Built and verified SCF package")


if __name__ == "__main__":
    main()
