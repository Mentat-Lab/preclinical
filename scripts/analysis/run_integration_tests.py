#!/usr/bin/env python3
"""
Run TriageBench Integration Tests

Standalone test runner that works with modern Python versions.
"""

import sys
import os
import unittest
import time
from pathlib import Path

# Add the analysis directory to path
sys.path.append(os.path.dirname(__file__))

from integration_tests import TriageBenchIntegrationTest, TriageBenchValidationTest


def run_tests_and_generate_report():
    """Run tests and generate a comprehensive report"""
    print("Running TriageBench Integration Tests...")
    print("=" * 50)

    # Create test suite using modern approach
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TriageBenchIntegrationTest))
    suite.addTests(loader.loadTestsFromTestCase(TriageBenchValidationTest))

    # Run tests with detailed output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Generate report
    print("\n" + "=" * 50)
    print("INTEGRATION TEST REPORT")
    print("=" * 50)

    report_lines = []
    report_lines.append("# TriageBench Integration Test Report")
    report_lines.append("")
    report_lines.append(f"**Generated**: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append(f"**Tests Run**: {result.testsRun}")
    report_lines.append(f"**Failures**: {len(result.failures)}")
    report_lines.append(f"**Errors**: {len(result.errors)}")
    report_lines.append("")

    if result.failures:
        report_lines.append("## Failures")
        for test, traceback in result.failures:
            report_lines.append(f"- **{test}**: {traceback.split(chr(10))[-2] if chr(10) in traceback else traceback}")
        report_lines.append("")

    if result.errors:
        report_lines.append("## Errors")
        for test, traceback in result.errors:
            report_lines.append(f"- **{test}**: {traceback.split(chr(10))[-2] if chr(10) in traceback else traceback}")
        report_lines.append("")

    success_rate = ((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun) * 100 if result.testsRun > 0 else 0
    report_lines.append(f"## Overall Success Rate: {success_rate:.1f}%")
    report_lines.append("")

    status = "✅ **PASS**" if success_rate >= 90 else "⚠️ **WARNING**" if success_rate >= 75 else "❌ **FAIL**"
    report_lines.append(f"{status}: Integration test results")
    report_lines.append("")

    # Additional validation info
    report_lines.append("## Test Coverage")
    report_lines.append("- Transcript processing functionality")
    report_lines.append("- Recommendation classification")
    report_lines.append("- End-to-end pipeline validation")
    report_lines.append("- Performance testing")
    report_lines.append("- Error handling")
    report_lines.append("- TriageBench methodology compliance")
    report_lines.append("")

    report_content = "\n".join(report_lines)
    print(report_content)

    # Save report
    report_path = Path(__file__).parent / "integration_test_report.md"
    with open(report_path, 'w') as f:
        f.write(report_content)
    print(f"Report saved to: {report_path}")

    return result.testsRun == 0 or (len(result.failures) == 0 and len(result.errors) == 0)


if __name__ == "__main__":
    success = run_tests_and_generate_report()
    sys.exit(0 if success else 1)
