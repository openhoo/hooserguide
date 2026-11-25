@manual
Feature: Work with HooTasks
  HooTasks keeps your team's work organized. Create a task, verify the saved
  result and adjust your workspace preferences with these short walkthroughs.

  Background:
    Given I open "/"
    Then "role=heading:Your workspace, in focus." is visible

  @tasks
  Scenario: Create your first task
    Add a task and check that its title and priority are still in the list after you reload.

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
        "padding": 18,
        "autoLabels": "letters",
        "description": "After you select Create task, look below the button for the save confirmation (C).",
        "marks": [
          { "target": "label=Task title", "kind": "box", "caption": "Your task title." },
          { "target": "label=Priority", "kind": "both", "color": "#2563eb", "caption": "The selected priority." },
          { "target": "role=status:Task result", "kind": "arrow", "caption": "The save confirmation." }
        ]
      }
      """

    When I reload the page
    Then "testid=task-list" has text "Prepare the launch checklistHigh priority"
    And I explain "Reload the page. Under Upcoming tasks, check that your task still shows the title and priority you chose."

  @preferences
  Scenario: Customize workspace notifications
    Choose whether to receive email notifications and save that choice for this browser session.

    And I add a note "Preferences are configured separately from individual tasks."
    And I add a warning "Enable email notifications only for an account you control."
    When I scroll to "label=Email notifications"
    And I check "label=Email notifications"
    Then "label=Email notifications" is checked
    And I click "role=button:Save preferences"
    Then "role=status:Preferences result" has text "Preferences saved."
    And I explain "Scroll below the task list to Workspace preferences. Select Email notifications, then Save preferences."
    And I explain "Look for the message “Preferences saved.” below the button."
    And I capture "Workspace preferences"
      """json
      {
        "focus": "css=.preferences",
        "padding": 24,
        "description": "Under Workspace preferences, select Email notifications (A), then Save preferences (B).",
        "marks": [
          { "target": "label=Email notifications", "kind": "box", "label": "A", "caption": "Turn notifications on or off." },
          { "target": "role=button:Save preferences", "kind": "box", "label": "B", "caption": "Save your preferences." }
        ]
      }
      """
    When I reload the page
    Then "label=Email notifications" is checked
