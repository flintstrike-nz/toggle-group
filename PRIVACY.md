# Privacy policy: Toggle Slicer

_Last updated: 19 October 2026_

Toggle Slicer is a Power BI custom visual. It runs entirely inside the Power BI report that hosts it.

## What the visual does with data

- **It collects nothing.** The visual does not collect, record, store or transmit any personal information, usage data, telemetry or analytics.
- **It makes no network requests.** It does not call any external service, and its `capabilities.json` declares no web-access privileges. It cannot send data anywhere outside the report.
- **It reads only what you bind to it.** The visual receives the values of the On/Off columns you drag into its field wells (for example `On` and `Off`) and the filters Power BI already holds for those columns. It uses them only to draw the toggles and to write back the filter for the toggle you click.
- **Its state lives in the report.** Each toggle's state is stored as a standard Power BI filter, the same way a native slicer's is. It is saved, shared and governed exactly like the rest of your report, under your organisation's Power BI settings.
- **It sets no cookies** and uses no browser storage of its own. The only thing it may write outside the report is text you ask it to copy: the **Copy** buttons on the placeholder put example DAX on your clipboard when you click them.

## The publisher

The publisher does not receive any data from your reports or your use of the visual, so there is nothing to access, correct or delete on the publisher's side. Your report data stays under the control of you and your Power BI tenant.

## Changes

If the visual's behaviour ever changed in a way that affected this policy (for example, adding a network call), this policy would be updated first and the change would be described in the release notes.

## Contact

Questions about this policy: open an issue at <https://github.com/flintstrike-nz/toggle-group/issues> or email hayden@flintstrike.co.nz.
