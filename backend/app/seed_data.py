"""Sample meetings. Plain data only; seed.py turns it into rows.

Each meeting: title, days_ago, people (first one is the host), tags,
lines [(speaker_index, text)], overview, keywords,
sections [(title, [(bullet, line_index)])],
actions [(assignee_index, text, line_index, done)].
"""

MEETINGS = [
    {
        "title": "Weekly Product Sync",
        "days_ago": 0,
        "people": ["Vishrut Grover", "Maya Chen", "Arjun Rao"],
        "tags": ["product", "planning"],
        "lines": [
            (0, "Thanks for joining everyone. Let's keep this tight today. We have three things: the search release, the onboarding drop-off numbers, and what we cut from the next sprint."),
            (1, "I'll start with search. The new index is live for about forty percent of users and results come back twice as fast. Nobody has reported wrong results so far, which is a great sign."),
            (0, "Love that. Arjun, what's the plan for rolling out to everyone?"),
            (2, "I want to ramp to eighty percent tomorrow and watch error rates for a day. If the dashboards stay clean we flip to a hundred on Thursday. The only risk is the weekend traffic spike, so I'd avoid Friday."),
            (0, "Agreed, no Friday launches. Maya, onboarding?"),
            (1, "Drop-off is a problem. Thirty percent of new users leave on the second step, where we ask them to connect a calendar. People are worried about permissions, and the copy doesn't explain why we need access."),
            (2, "We could make that step skippable and ask again after their first meeting. That's an easy change and it removes the blocker."),
            (0, "I like that. Maya, can you draft the new copy and a skip button design by Wednesday?"),
            (1, "Yes, I'll have both ready Wednesday. I'll also test a shorter version of the permission text with five users."),
            (0, "Good. Now the sprint. We're over capacity, so something has to move. My suggestion is to push the export redesign to next sprint."),
            (2, "That works for me. The export redesign has a few open questions anyway, and the search rollout will keep me busy this week."),
            (0, "Great, so the decisions are: ramp search to eighty percent tomorrow, make the calendar step skippable, and move export to next sprint. Thanks everyone."),
        ],
        "overview": "The team reviewed the search rollout, onboarding drop-off and sprint capacity. Search ramps to 80 percent tomorrow with a full release on Thursday, the calendar step becomes skippable, and the export redesign moves to the next sprint.",
        "keywords": ["search rollout", "onboarding", "drop-off", "calendar step", "sprint capacity", "export redesign"],
        "sections": [
            ("Search release", [
                ("New index is live for about 40 percent of users with results twice as fast", 1),
                ("Ramp to 80 percent tomorrow, full release Thursday, avoid Friday launches", 3),
            ]),
            ("Onboarding drop-off", [
                ("30 percent of new users leave at the calendar connection step", 5),
                ("Make the step skippable and ask again after the first meeting", 6),
            ]),
            ("Sprint planning", [
                ("Over capacity, export redesign moves to next sprint", 9),
            ]),
        ],
        "actions": [
            (1, "Draft skip-button design and new permission copy", 7, False),
            (1, "Test shorter permission text with five users", 8, False),
            (2, "Ramp search rollout to 80 percent and monitor error rates", 3, True),
        ],
    },
    {
        "title": "Design Review: Onboarding Flow",
        "days_ago": 1,
        "people": ["Vishrut Grover", "Maya Chen", "Sofia Alvarez"],
        "tags": ["design", "onboarding"],
        "lines": [
            (1, "Here is the new onboarding flow. Three screens instead of five: welcome, connect, and a first-meeting checklist. I removed the profile step entirely."),
            (2, "Looks much cleaner. My only concern is the welcome screen. There is a lot of text, and on small laptops the button drops below the fold."),
            (1, "Good catch. I can cut the second paragraph and move the illustration to the side on wide screens."),
            (0, "What about the checklist? I want people to understand the product in under a minute, not feel like they have homework."),
            (2, "Three items max. Upload a file, read the summary, ask one question. Anything beyond that feels like a chore."),
            (1, "I like that. I'll rename it from checklist to quick start so it feels lighter."),
            (0, "How are we handling empty states? The first thing people see after onboarding is an empty library."),
            (2, "We should pre-load one sample meeting. It shows the transcript, the summary and the action items right away, without any setup."),
            (0, "That is a great idea. It also helps the demo. Sofia, can you pick a good sample and write the transcript?"),
            (2, "Yes, I'll write something short about a product sync so it feels familiar. I'll send it Thursday."),
            (1, "I'll update the designs tonight and share the prototype link tomorrow morning."),
        ],
        "overview": "Maya presented a three-screen onboarding flow. The group agreed to shorten the welcome copy, rename the checklist to quick start with three items, and pre-load a sample meeting so new users never see an empty library.",
        "keywords": ["onboarding", "welcome screen", "quick start", "empty state", "sample meeting"],
        "sections": [
            ("New flow", [
                ("Three screens replace five; profile step removed", 0),
                ("Shorten welcome copy so the button stays above the fold", 1),
            ]),
            ("Quick start", [
                ("Maximum three items: upload, read summary, ask a question", 4),
                ("Rename checklist to quick start", 5),
            ]),
            ("Empty states", [
                ("Pre-load one sample meeting to show transcript, summary and tasks", 7),
            ]),
        ],
        "actions": [
            (2, "Write the sample meeting transcript", 9, False),
            (1, "Update designs and share prototype link", 10, False),
        ],
    },
    {
        "title": "Customer Call: Acme Logistics",
        "days_ago": 2,
        "people": ["Vishrut Grover", "Daniel Okafor"],
        "tags": ["customer", "sales"],
        "lines": [
            (0, "Daniel, thanks for making time. I'd love to hear how your team is handling meeting notes today, and where it hurts the most."),
            (1, "Honestly it's messy. Our dispatchers have calls all day, and the notes end up in five different places. Follow-ups slip through, and that costs us real money."),
            (0, "What does a missed follow-up usually look like?"),
            (1, "Last month a driver schedule change was agreed on a call, but nobody wrote it down. Two trucks went out late. We want every call to end with a clear list of who does what."),
            (0, "That's exactly what the action items view is for. Every task gets an owner and a timestamp, so you can jump to the moment it was agreed."),
            (1, "That timestamp part is useful. Can we search across all our calls? Say I want every mention of a specific customer."),
            (0, "Yes. Search covers every transcript, and you can filter by participant or date."),
            (1, "Good. Security is the other question. Our legal team will ask where the data lives and who can see it."),
            (0, "I'll send you our security overview today. Meetings are private by default, and nothing is shared unless you choose to."),
            (1, "Perfect. If that checks out, we'd like to pilot with the dispatch team for a month."),
            (0, "Great. I'll prepare a pilot plan and send it with the security document by Friday."),
        ],
        "overview": "Acme Logistics loses follow-ups because call notes are scattered. They want owner-tagged action items and cross-call search, and need a security review before piloting with the dispatch team for a month.",
        "keywords": ["follow-ups", "action items", "search", "security", "pilot", "dispatch"],
        "sections": [
            ("Pain points", [
                ("Notes spread over five places, follow-ups slip", 1),
                ("A missed schedule change sent two trucks out late", 3),
            ]),
            ("Requirements", [
                ("Clear owners and timestamps for every task", 4),
                ("Search across all calls by customer name", 5),
            ]),
            ("Next steps", [
                ("Legal wants a security overview before the pilot", 7),
                ("One month pilot with the dispatch team", 9),
            ]),
        ],
        "actions": [
            (0, "Send security overview to Daniel", 8, True),
            (0, "Prepare pilot plan and send with the security document", 10, False),
        ],
    },
    {
        "title": "Engineering Standup",
        "days_ago": 3,
        "people": ["Vishrut Grover", "Arjun Rao", "Priya Nair", "Liam Walker"],
        "tags": ["engineering", "standup"],
        "lines": [
            (1, "Yesterday I finished the search indexing change. Today I'm watching the rollout. No blockers, but I need a review on the migration script."),
            (2, "I can review it this morning. My update: the export endpoint is done, and I'm writing tests for the CSV format today."),
            (3, "I'm stuck on the audio player. Seeking works in Chrome, but Safari jumps back to the start after a seek. I'll dig into it, but it might take the whole day."),
            (0, "Liam, that's a bug worth fixing, since half our demo users are on Safari. Do you want help?"),
            (3, "Maybe later. I have a hunch it's the range request headers on the media route, so I'll check that first."),
            (2, "That sounds right. Safari is strict about byte ranges. I had the same problem on a previous project."),
            (0, "Great, Priya, share what you remember with Liam after this. Anything else blocking?"),
            (1, "The staging database is slow again. It was fine last week, so something changed. I'll check the query logs after the review."),
            (0, "Okay. Let's sync again tomorrow at the same time. Good progress everyone."),
        ],
        "overview": "Quick standup. Search indexing is shipped and being monitored, the export endpoint is done, a Safari audio seeking bug is being traced to range request headers, and staging database slowness needs investigation.",
        "keywords": ["indexing", "migration", "export endpoint", "Safari", "range requests", "staging database"],
        "sections": [
            ("Progress", [
                ("Search indexing change is done and being monitored", 0),
                ("Export endpoint finished, CSV tests in progress", 1),
            ]),
            ("Blockers", [
                ("Safari jumps to the start after seeking in the audio player", 2),
                ("Staging database got slow again", 7),
            ]),
        ],
        "actions": [
            (2, "Review the migration script", 1, True),
            (3, "Check range request headers on the media route", 4, False),
            (1, "Inspect staging database query logs", 7, False),
        ],
    },
    {
        "title": "Q4 Roadmap Planning",
        "days_ago": 5,
        "people": ["Vishrut Grover", "Maya Chen", "Priya Nair", "Daniel Okafor"],
        "tags": ["roadmap", "planning"],
        "lines": [
            (0, "Let's decide the top three bets for Q4. We have time for three, maybe four, and the list currently has nine ideas."),
            (3, "From the customer side, the loudest request is shared team workspaces. Five of our last eight calls asked about it."),
            (1, "From design, I'd put mobile notes high. People review meetings on their phones during commutes, and our mobile layout is basic."),
            (2, "Engineering view: shared workspaces are big, probably eight weeks. Mobile is smaller, around four. Integrations with calendars are about three."),
            (0, "So workspaces is large but wanted, mobile is medium and calendar is small. What do we lose if we skip workspaces?"),
            (3, "Honestly, two enterprise deals. Both said they'd wait for it, but not forever."),
            (0, "That settles it for me. Workspaces is bet one. Then calendar integration, since it's cheap and helps onboarding, and mobile as bet three."),
            (1, "I'm happy with that order. I can start mobile design while engineering begins on workspaces."),
            (2, "We should scope workspaces carefully. I'd propose permissions first, then sharing, then comments, so we can ship in pieces."),
            (0, "Yes, ship in pieces. Priya, can you write a scoped plan with milestones for the next review?"),
            (2, "I'll have a draft by next Tuesday."),
        ],
        "overview": "The team chose Q4 bets: shared workspaces first, calendar integration second, and mobile notes third. Workspaces ship in pieces: permissions, then sharing, then comments. Skipping workspaces risks two enterprise deals.",
        "keywords": ["Q4", "workspaces", "mobile", "calendar integration", "enterprise deals", "milestones"],
        "sections": [
            ("Candidates", [
                ("Nine ideas, capacity for three or four", 0),
                ("Workspaces asked for in five of the last eight customer calls", 1),
            ]),
            ("Estimates", [
                ("Workspaces eight weeks, mobile four, calendar integration three", 3),
            ]),
            ("Decision", [
                ("Order: workspaces, calendar integration, mobile", 6),
                ("Ship workspaces in pieces: permissions, sharing, comments", 8),
            ]),
        ],
        "actions": [
            (2, "Write scoped workspace plan with milestones", 9, False),
            (1, "Start mobile notes design", 7, False),
        ],
    },
    {
        "title": "Interview: Backend Engineer",
        "days_ago": 7,
        "people": ["Vishrut Grover", "Liam Walker"],
        "tags": ["hiring"],
        "lines": [
            (0, "Thanks for coming in. Let's start with something you built recently that you're proud of. What was it and what was hard about it?"),
            (1, "Last year I rebuilt our notification service. It was sending duplicates under load because two workers could pick up the same job. I moved it to a queue with idempotency keys."),
            (0, "How did you know idempotency keys were the right fix and not just a patch?"),
            (1, "I reproduced the duplicates in a load test first, then confirmed that the same job id showed up twice in the logs. After the fix, I ran the same test and the duplicates dropped to zero."),
            (0, "Nice. Let's talk about databases. When would you not use an ORM?"),
            (1, "For heavy reporting queries or bulk inserts. An ORM is great for everyday reads and writes, but I'd write SQL where I need to control the query plan."),
            (0, "Fair answer. A design question: how would you build search across transcripts?"),
            (1, "I'd start with the database's built-in full text search. It's simple and keeps data in one place. Only if it gets slow would I add a separate search service."),
            (0, "I like the restraint there. Any questions for me?"),
            (1, "How does the team handle on-call? And what does the first month look like for a new engineer?"),
            (0, "On-call is a weekly rotation with a buddy for the first two. Your first month is a small production fix, then a feature you own end to end."),
        ],
        "overview": "Strong technical interview. The candidate fixed duplicate notifications with idempotency keys and verified it with a load test, explained when to skip an ORM, and recommended built-in full text search before adding a search service.",
        "keywords": ["idempotency", "load test", "ORM", "full text search", "on-call", "first month"],
        "sections": [
            ("Experience", [
                ("Rebuilt the notification service using a queue and idempotency keys", 1),
                ("Verified the fix with a load test, duplicates dropped to zero", 3),
            ]),
            ("Technical depth", [
                ("Would use raw SQL for reporting and bulk inserts instead of an ORM", 5),
                ("Starts with built-in full text search before adding new services", 7),
            ]),
        ],
        "actions": [
            (0, "Send feedback summary to the hiring panel", 10, False),
            (0, "Schedule the system design round", 8, False),
        ],
    },
]
