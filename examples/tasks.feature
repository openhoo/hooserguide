@manual
Feature: Work with HooTasks
  HooTasks keeps your team's work organized. Create a task, verify the saved
  result and adjust your workspace preferences with these short walkthroughs.

  Background:
    Given I open "/"
    Then "role=heading:Your workspace, in focus." is visible

  Scenario: Create your first task
    And I explain "Enter a clear task title and choose its priority."
    And I capture "Fill in the task details"
      """json
      {
        "description": "A names your task. B controls its priority. Select Create task to save it.",
        "marks": [
          { "target": "label=Task title", "kind": "box", "label": "A", "caption": "Give the task a descriptive title." },
          { "target": "label=Priority", "kind": "both", "label": "B", "caption": "Choose a priority for your team." },
          { "target": "role=button:Create task", "kind": "arrow", "label": "1", "caption": "Save the new task." }
        ]
      }
      """
    When I fill "label=Task title" with "Prepare the launch checklist"
    And I select "high" in "label=Priority"
    And I click "role=button:Create task"
    Then "role=status:Task result" has text "Task created successfully."
    And "testid=task-list" has text "Prepare the launch checklistHigh priority"
    And I explain "Select Create task. Check that the task appears in the list and that a confirmation is shown."
    And I capture "Check the saved task"
      """json
      {
        "description": "The task now appears in your workspace. The confirmation shows that the save completed.",
        "marks": [
          { "target": "testid=task-list", "kind": "box", "label": "2", "caption": "Your newly created task." },
          { "target": "role=status:Task result", "kind": "both", "label": "3", "caption": "Successful save confirmation." }
        ]
      }
      """

  Scenario: Customize workspace notifications
    When I scroll to "label=Email notifications"
    And I check "label=Email notifications"
    And I click "role=button:Save preferences"
    Then "role=status:Preferences result" has text "Preferences saved."
    And I explain "Open Workspace preferences, enable Email notifications and select Save preferences."
    And I capture "Workspace preferences"
      """json
      {
        "fullPage": true,
        "description": "Preferences are near the bottom of the workspace. Long screenshots stay readable across PDF pages.",
        "marks": [
          { "target": "label=Email notifications", "kind": "box", "label": "A", "caption": "Turn notifications on or off." },
          { "target": "role=button:Save preferences", "kind": "both", "label": "B", "caption": "Save your preferences." }
        ]
      }
      """
