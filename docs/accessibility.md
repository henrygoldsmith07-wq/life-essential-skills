# Accessibility verification

[Dashboard](../learner/index.html) · [Architecture](architecture.md) · [Product review](product-review.md)

## Automated safeguards

Normal GitHub quality CI includes Playwright browser journeys and axe checks against WCAG 2 A/AA and 2.1 AA tags. Each main screen is checked at 390 × 844 with reduced motion. The feedback flow is checked separately. Tests exercise keyboard activation, a visible focus outline, labelled controls, essential criterion selections, required-response errors, status announcements in markup and mobile document reflow. Assessor and observation controls use the same rubric helpers as learner review.

These checks use the [official Playwright accessibility integration](https://playwright.dev/docs/accessibility-testing) and a [local test web server](https://playwright.dev/docs/test-webserver). They do not establish complete accessibility conformance. A simulated reduced-motion preference checks the supported mode, not a user's experience of every animation.

## Manual release checks

- Tab and Shift-Tab through navigation, filters, attempt, review, import and export; activate controls with Enter/Space and open details with the keyboard.
- Check the skip link, visible focus and focus return when a guide/task closes. Initial load should show the header and navigation without forcing the page to scroll.
- Check headings, label announcements, fieldset legends and error/status announcements with a real screen reader. Verify that a missing response or judgement moves focus to the missing control and identifies the error.
- Check 320 CSS pixel width, zoom, long labels and a large text setting. Scrolling tables must remain usable; page content should not require horizontal document scrolling.
- Verify contrast and that essential steps, evidence levels and errors remain understandable without colour.
- Provide screen reader, scribe, extra time, spoken response, large print, translation or alternative fictional context independently of solving help. Confirm that access supports never reduce the derived result.

Local browser QA verifies layout and keyboard behaviour. Real screen-reader and assistive-technology usability testing still needs representative users; an automated green result must not be presented as that testing.
