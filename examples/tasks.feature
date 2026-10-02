@manual
Feature: Work with HooTasks
  HooTasks keeps your team's work organized. Create a task, verify the saved
  result and adjust your workspace preferences with these short walkthroughs.

  Background:
    Given I open "/"
    Then "role=heading:Your workspace, in focus." is visible

  @tasks
  Scenario: Create your first task
    And I add a prerequisite "Open your workspace with permission to create tasks."
    And I add a tip "Use a short title that describes the next action."
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

    And I capture "Task form in detail"
      """json
      {
        "focus": "css=.grid > .card:first-child",
        "padding": 40,
        "autoLabels": "letters",
        "description": "A focused view keeps the form readable and assigns references automatically.",
        "marks": [
          { "target": "label=Task title", "kind": "box", "caption": "Your task title." },
          { "target": "label=Priority", "kind": "both", "color": "#2563eb", "caption": "The selected priority." },
          { "target": "role=status:Task result", "kind": "arrow", "caption": "The save confirmation." }
        ]
      }
      """

  @preferences
  Scenario: Customize workspace notifications
    And I add a note "Preferences are configured separately from individual tasks."
    And I add a warning "Enable email notifications only for an account you control."
    When I scroll to "label=Email notifications"
    And I check "label=Email notifications"
    Then "label=Email notifications" is checked
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
