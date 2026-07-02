/**
 * Plain-English copy for backend error codes.
 *
 * The Python backend raises `_CommandError(code, message)`; the `code` is a
 * stable machine string (e.g. `cloud_unreachable`) while `message` is sometimes
 * a raw exception string that is unhelpful to end users. This map lets the UI
 * render a friendly, actionable sentence keyed on the code, and fall back to the
 * backend message only when a code is unmapped.
 *
 * Keep this in sync with the `_CommandError(...)` call sites in
 * `conxa-builder/python/backend.py` and the entitlement copy in
 * `backend.py:_entitlement_error_message`.
 */
export const errorMessages: Record<string, string> = {
  // Cloud / connectivity
  cloud_unreachable:
    "Can't reach Conxa Cloud right now. Check your internet connection and try again.",
  cloud_publish_failed:
    "Publishing to Conxa Cloud didn't complete. Please try publishing again.",
  installer_upload_failed:
    "The installer couldn't be uploaded to the cloud. Please try again.",
  entitlements_unavailable:
    "Conxa Cloud can't confirm your plan right now, so this action is paused. Try again in a moment.",

  // Plan limits / quota
  quota_exceeded:
    "You've reached your monthly usage limit for this workspace. Upgrade your plan or wait for the next cycle.",
  compile_credit_limit_exceeded:
    "You've used all of this month's compile credits. Upgrade your plan or wait for the next cycle.",
  human_edit_pool_exceeded:
    "You've used all of this month's Human Edit tokens. Upgrade your plan or wait for the next cycle.",
  installer_limit_exceeded:
    "You've reached the number of installers allowed on your plan. Upgrade to publish more.",
  seat_limit_exceeded:
    "Your workspace is at its seat limit. Upgrade your plan to add more members.",
  invalid_usage_class: "Something went wrong charging this action. Please try again.",

  // Recording / auth
  recording_in_progress:
    "A recording is already running. Finish or stop it before starting another.",
  recorder_launch_failed:
    "The recorder browser couldn't start. Close any leftover browser windows and try again.",
  empty_recording: "No actions were recorded. Record at least one step before continuing.",
  no_events: "This session has no recorded actions to work with.",
  auth_required:
    "Please record a sign-in for this workflow first, then try again.",
  auth_capture_failed:
    "The sign-in window closed before it could be saved. Please record auth again.",
  auth_file_in_build_input:
    "Sign-in credentials were found in the build folder and can't be shipped. Remove them and rebuild.",

  // Build / compile / test
  pack_not_built: "Build this skill pack before continuing.",
  plugin_not_built: "Build the plugin before testing its workflows.",
  not_built: "This plugin hasn't been built yet.",
  workflow_not_compiled: "Compile this workflow before testing it.",
  workflow_test_failed: "The workflow test didn't pass. Review the steps and try again.",
  invalid_plugin: "This plugin is missing required information and can't be used.",
  invalid_document: "This skill file is missing its skills and can't be opened.",
  invalid_selector:
    "One of the recorded elements can't be targeted reliably. Re-record that step.",

  // Input / validation
  invalid_input: "Some required information is missing. Fill in the highlighted fields.",
  invalid_release_version:
    "The installer version must look like 1.2.3 (optionally 1.2.3-beta.1).",
  invalid_release_notes: "A release message is required (up to 2000 characters).",
  invalid_frame_label: "A frame label is required for this step.",

  // Not found
  not_found: "We couldn't find what you were looking for.",
  plugin_not_found: "That plugin no longer exists.",
  workflow_not_found: "That workflow no longer exists.",
  session_not_found: "That recording session no longer exists.",
  skill_not_found: "That skill no longer exists.",
  step_not_found: "That step no longer exists.",
  package_not_found: "That package no longer exists.",
  run_not_found: "That run no longer exists.",

  // Edit history
  nothing_to_undo: "There's nothing to undo.",
  nothing_to_redo: "There's nothing to redo.",

  // Transport / system
  unknown_command: "Something went wrong inside the app. Please try again.",
  internal_error: "Something went wrong inside the app. Please try again.",
  bad_json: "The app received a malformed response. Please try again.",
  backend_not_running:
    "The Build Studio engine isn't running. Restart the app and try again.",
  error: "Something went wrong. Please try again.",
}
