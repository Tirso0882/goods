"""The core stays reusable: it imports nothing from the web shell (ADR 0019)."""

import ast
from pathlib import Path

import agent_core

# The service shell and the web stack it is built on.
FORBIDDEN = {"agent_service", "fastapi", "starlette", "uvicorn"}
SOURCE = Path(agent_core.__file__).parent


def imported_modules(path: Path) -> set[str]:
    modules: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(), filename=str(path))):
        if isinstance(node, ast.Import):
            modules.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            modules.add(node.module.split(".")[0])
    return modules


def test_the_core_imports_nothing_from_the_service_shell() -> None:
    offenders = {
        str(path.relative_to(SOURCE)): sorted(imported_modules(path) & FORBIDDEN)
        for path in sorted(SOURCE.rglob("*.py"))
        if imported_modules(path) & FORBIDDEN
    }

    assert offenders == {}
