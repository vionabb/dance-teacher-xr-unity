# Shared test fixtures

This directory contains small, committed data fixtures shared by the
motion-pipeline and web-frontend projects. Generated outputs belong in the
owning subproject's ignored `temp/` or `testResults/` directory instead.

- [`smoketest/`](smoketest/): stage-organized inputs for cross-project smoke
  testing. The manifest defines the available cases and the fixture paths.

Keep fixtures immutable during tests. Promote a generated output only after it
has been validated and its provenance has been recorded in the relevant
manifest.
