# Severity Rubric

Use these definitions to classify each finding.

## High — Actively confusing

The reader may misunderstand, take the wrong action, or give up. Fix these first.

**Triggers:**
- Ambiguous pronoun references [pl-07]
- Buried main idea (exception before rule) [pl-22]
- Passive voice hiding who is responsible [pl-09]
- Double or triple negatives [pl-17]
- Long sentences (≥ 40 words) with multiple embedded clauses [pl-15]

| Before | After | Why high |
|--------|-------|----------|
| The database will be initialized by the setup script after the configuration is validated by the system. | The system validates the configuration, then the setup script initializes the database. | Stacked passives |
| Except when the API key has not been set, the request will not fail to authenticate unless the token is invalid. | The request authenticates if the API key is set and the token is valid. | Triple negative |
| It must be done before deployment. | You must complete the migration before deployment. | Ambiguous "it" + hidden actor |

## Medium — Unnecessarily complex

The reader can figure it out but has to work harder than needed. Fix after high-severity items.

**Triggers:**
- Jargon when a simpler word exists [pl-02]
- Hidden verbs / nominalizations [pl-03]
- Sentences over ~30 words [pl-15]
- Unnecessary abbreviations [pl-06]
- Inconsistent terminology [pl-04]
- Excess modifiers (really, very, basically) [pl-20]
- Redundant word pairs / doublets ("each and every") [pl-21]

| Before | After | Why medium |
|--------|-------|------------|
| In order to utilize the configuration module, you must first perform the initialization of the settings. | To use the configuration module, first initialize the settings. | Wordiness + hidden verb |
| The endpoint facilitates the retrieval of user data. | The endpoint retrieves user data. | Hidden verb |
| RBAC policies should be configured via the IAM dashboard prior to commencing the deployment process. | Set up role-based access control in the IAM dashboard before you deploy. | Jargon + hidden verb + wordiness |

## Low — Minor polish

Readable but could be tighter. Address if time permits.

**Triggers:**
- Missing contractions where natural [pl-14]
- Series that would read better as a list [pl-25]
- Missing transition words [pl-28]
- Vague headings [pl-23]
- Slightly wordy phrasing [pl-01]

| Before | After | Why low |
|--------|-------|---------|
| You will need to install the dependencies, configure the environment variables, and then run the test suite. | You'll need to: (1) install dependencies, (2) configure environment variables, and (3) run the test suite. | List-scannability |
| It is not possible to undo this action. | You can't undo this action. | Wordiness |
| Configuration | How to configure the app | Vague heading |
