# Before-and-After Examples

**Contents:** 1. Cutting wordiness · 2. Breaking apart dense sentences with lists · 3. Resolving ambiguous modifiers · 4. Exception before rule · 5. Passive to active · 6. Complex eligibility → list · 7. Simplifying safety info · 8. "Shall" → "must" · 9. Hidden verbs · 10. Double negative · 11. README wordiness · 12. Confusing API docs · 13. Verbose error message · 14. UI string passive/jargon

## 1. Cutting wordiness — "To" replaces wordy openers

Before:
> When the process of freeing a vehicle that has been stuck results in ruts or holes, the operator will fill the rut or hole created by such activity before removing the vehicle from the immediate area.

After:
> If you make a hole while freeing a stuck vehicle, you must fill the hole before you drive away.

**Rules demonstrated:** Write short sentences, use simple words, use active voice, address the user

---

## 2. Breaking apart dense sentences with lists

Before:
> Each completed well drilling application must contain a detailed statement including the following information: the depth of the well, the casing and cementing program, the circulation media (mud, air, foam, etc.), the expected depth and thickness of fresh water zones, and well site layout and design.

After:
> With your application for a drilling permit, provide the following information:
> - Depth of the well
> - Casing and cementing program
> - Circulation media (mud, air, foam, etc.)
> - Expected depth and thickness of fresh water zones
> - Well site layout and design

**Rules demonstrated:** Use lists, address the user, write short sentences

---

## 3. Resolving ambiguous modifiers

Before:
> This rule proposes the Spring/Summer subsistence harvest regulations in Alaska for migratory birds that expire on August 31, 2003.

After:
> This rule proposes the Spring/Summer subsistence harvest regulations for migratory birds in Alaska. The regulations will expire on August 31, 2003.

**Rules demonstrated:** Place words carefully, write short sentences (what expires — the birds or the regulations?)

---

## 4. Exception before rule → rule before exception

Before:
> Except as described in paragraph (b), the Division Manager will not begin the 180-day review period until the preliminary review determines that your submission is administratively complete.

After:
> The Division Manager will not begin the 180-day review period until the preliminary review determines that your submission is administratively complete. However, see paragraph (b) for an exception.

**Rules demonstrated:** Place the main idea before exceptions, write short sentences

---

## 5. Passive to active, impersonal to direct

Before:
> Copies of tax returns must be provided.

After:
> You must provide copies of your tax returns.

**Rules demonstrated:** Use active voice, address the user

---

## 6. Complex eligibility → scannable list

Before:
> Medicaid: Apply if you are aged (65 years old or older), blind, or disabled and have low income and few resources. Apply if you are terminally ill and want to receive hospice services. Apply if you are aged, blind, or disabled; live in a nursing home; and have low income and limited resources.

After:
> You may apply for Medicaid if you are:
> - Terminally ill and want hospice services
> - Eligible for Medicare and have low income and limited resources
> - 65 or older, blind, or disabled with low income and few resources, and:
>   - Live in a nursing home, or
>   - Need nursing home care but can stay home with community care services

**Rules demonstrated:** Use lists, write short sentences, address the user

---

## 7. Simplifying safety information

Before:
> Infants and children who drink water containing lead in excess of the action level could experience delays in their physical or mental development. Children could show slight deficits in attention span and learning abilities. Adults who drink this water over many years could develop kidney problems or high blood pressure.

After:
> Lead in drinking water can make you sick. Possible health effects:
>
> **Children:** Delayed growth, learning disabilities, short attention span
>
> **Adults:** Kidney problems, high blood pressure

**Rules demonstrated:** Write short sentences, use lists, address the user, add useful headings

---

## 8. "Shall" → "must" with active voice

Before:
> Any oil or gas lessee who wishes to use timber for fuel in drilling operations shall file an application therefor with the officer who issued the lease. The applicant shall be notified by registered mail in all cases where the permit applied for is not granted.

After:
> You must file an application to use the timber on your oil or gas lease for fuel. File the application with our office where you got your lease. We will notify you by registered mail if we reject your application.

**Rules demonstrated:** Use "must" for requirements, use active voice, address the user, use simple words

---

## 9. Hidden verbs uncovered

Before:
> If you cannot make the payment of the $100 fee, you must make an application in writing before you file your tax return.

After:
> If you cannot pay the $100 fee, you must apply in writing before you file your tax return.

**Rules demonstrated:** Avoid hidden verbs ("make the payment" → "pay", "make an application" → "apply")

---

## 10. Double negative eliminated

Before:
> No approval of any noise compatibility program may be implied in the absence of the agency's express approval.

After:
> You must get the agency's express approval for any noise compatibility program.

**Rules demonstrated:** Use positive language, use active voice, address the user

---

## 11. README with hidden verbs and wordiness

Before:
> The installation of the package can be accomplished by utilization of npm. Configuration of the environment variables is a requirement prior to the initialization of the application.

After:
> Install the package with npm. Configure your environment variables before you start the application.

**Rules demonstrated:** Avoid hidden verbs ("installation of" → "install", "utilization of" → use of → with, "initialization of" → "start"), use simple words, use active voice, write short sentences

---

## 12. Confusing API documentation

Before:
> In the event that the request payload does not contain a valid authentication token, the server will return an error response that indicates the request has not been authorized, and the client application should make a determination as to whether to redirect the user to the login page or to display an appropriate error message.

After:
> If the request has no valid auth token, the server returns a 401 error. Your app should either redirect the user to the login page or show an error message.

**Rules demonstrated:** Use simple words ("in the event that" → "if"), avoid hidden verbs ("make a determination" → decide/should), write short sentences, use active voice

---

## 13. Verbose error message

Before:
> An error was encountered during the process of attempting to establish a connection to the database server. It is recommended that you verify that the server is currently running and that your connection parameters have been configured correctly.

After:
> Could not connect to the database. Check that the server is running and your connection settings are correct.

**Rules demonstrated:** Use active voice, write short sentences, use simple words, cut wordiness

---

## 14. UI string with passive voice and jargon

Before:
> Your submission has been received and will be processed by our team. You will be notified via email upon completion of the review.

After:
> We received your submission. Our team will review it and email you when it's done.

**Rules demonstrated:** Use active voice, address the user, use simple words ("upon completion of the review" → "when it's done"), write short sentences
