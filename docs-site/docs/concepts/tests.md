# Tests

A test (also called a test suite) is a collection of scenarios that run together. Tests allow you to:

- Group related scenarios for specific testing goals
- Run multiple scenarios in parallel
- Track results over time
- Compare agent performance across versions

## Seed Scenarios

Preclinical ships with a set of seed scenarios covering common healthcare AI testing categories. You can also generate custom scenarios from clinical text using the [scenario generation API](../api-reference/generate-scenario.md).

Scenarios are organized by type:

| Type | Description |
|------|-------------|
| `demo` | Quick validation scenarios for testing your integration |
| `full` | Comprehensive test scenarios |
| `custom` | User-generated scenarios |

## Test Configuration

When running a test, you can configure:

| Option | Description | Default |
|--------|-------------|---------|
| Max turns | Maximum conversation turns per scenario (clamped to 5-7 range) | 6 |
| Concurrency | Maximum parallel scenario executions | 6 |
| Max scenarios | Limit number of scenarios to run | All in suite |

## Best Practices

- **Start small, then expand** -- Begin with a few demo scenarios to validate your integration works, then expand to comprehensive testing.
- **Group by purpose** -- Create focused test suites for specific validation goals rather than one massive test.
- **Version your tests** -- Create new tests for major agent updates to track improvement over time.
- **Include edge cases** -- Don't just test happy paths. Include scenarios that probe boundary conditions.
