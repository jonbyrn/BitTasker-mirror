fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android internal

```sh
[bundle exec] fastlane android internal
```

Build and upload to Internal Testing

### android production

```sh
[bundle exec] fastlane android production
```

Build and upload to Production

### android closed_testing

```sh
[bundle exec] fastlane android closed_testing
```

Build and upload to Closed Testing

### android promote_to_closed

```sh
[bundle exec] fastlane android promote_to_closed
```

Promote internal to closed testing

### android promote_to_production

```sh
[bundle exec] fastlane android promote_to_production
```

Promote closed testing to production

### android update_metadata

```sh
[bundle exec] fastlane android update_metadata
```

Update store listing metadata only

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
