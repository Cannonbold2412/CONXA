"""Regression guard: the compile path must never pull in numpy.

Pillow < 11.1.0 imports `numpy.typing` unconditionally at runtime (see
`PIL/_typing.py`), not just for type checking. On a machine with a large
numpy-dependent site-packages tree, loading numpy's native OpenBLAS extension
from inside a background dispatch thread — which is how `handlers/compile.py`
lazily imports `conxa_compile.recorder.frame_extractor` on every compile — can
deadlock in the Windows loader lock and hang the compile forever with no error
(see FIX.md, 2026-08-15, "Fixed a compile freeze at 'Loading session
events…'"). `requirements.txt` now floors Pillow at >=11.1.0, which moved that
import behind `if TYPE_CHECKING:`.

Runs the import in a subprocess: an in-process `assert 'numpy' not in
sys.modules` would be worthless, since an earlier test in the same session may
have already imported numpy for an unrelated reason.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_recorder_visual_does_not_import_numpy() -> None:
    probe = (
        "import conxa_compile.recorder.visual, sys; "
        "sys.exit(1 if 'numpy' in sys.modules else 0)"
    )
    # pytest.ini's `pythonpath` setting only affects pytest's own sys.path, not a
    # child process — reconstruct it via PYTHONPATH so the subprocess can find
    # conxa_compile the same way this test suite does.
    repo_root = Path(__file__).resolve().parents[2]
    env = {
        **os.environ,
        "PYTHONPATH": os.pathsep.join(
            [str(repo_root / "conxa-builder" / "python"), os.environ.get("PYTHONPATH", "")]
        ),
    }
    result = subprocess.run(
        [sys.executable, "-c", probe],
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )
    assert result.returncode == 0, (
        "conxa_compile.recorder.visual pulled numpy into sys.modules — this is "
        "the exact import chain that deadlocked compiles (Pillow's PIL/_typing.py "
        f"importing numpy.typing at runtime). Pillow version regression?\n"
        f"stdout={result.stdout!r} stderr={result.stderr!r}"
    )
