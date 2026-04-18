1. Requiremment Clarification

    a. Functional Requiremment

        i. Users can create a profile with preferences (e.g. age range, interests) and specify a maximum distance.
        ii. Users can view a stack of potential matches in line with their preferences and within max distance of their current location.
        iii. Users can swipe right / left on profiles one-by-one, to express "yes" or "no" on other users.
        iv. Users get a match notification if they mutually swipe on each other.

        Below the line (out of scope)
            i. Users should be able to upload pictures.
            ii. Users should be able to chat via DM after matching.
            iii. Users can send "super swipes" or purchase other premium features.


    b. Non - Functional Requiremment

        i. The system should have strong consistency for swiping. If a user swipes "yes" on a user who already swiped "yes" on them, they should get a match notification.
        ii. The system should scale to lots of daily users / concurrent users (20M daily actives, ~100 swipes/user/day on average).
        iii. The system should load the potential matches stack with low latency (e.g. < 300ms).
        iv. The system should avoid showing user profiles that the user has previously swiped on.


        Below the line (out of scope)
            The system should protect against fake profiles.
            The system should have monitoring / alerting.


    

2. Metrices (Numbers)

    DAU - 10M


    10M * 100 (swipe) = 1B swipe per day
    1B / 100k = 10k swipe per second
    peak time = 10k * 10 = 100k swipes

    Storage
        Swipe metadata
            100 byte * 100k peak per second


        Postgres
            10k write per node

        Bloom Filter
            10M * 100 * 100 byte * 365 = 36.5 TB


3. API Design

    i. Create Profile

        Endpoint: POST /profile

        Payload: {
            "age_min": 20,
            "age_max": 30,
            "distance": 10,
            "interestedIn": "female" | "male" | "both",
            ...
        }


    ii. Get Feed

        Endpoint: GET /feed?lat={}&long={}&distance={} -> User[]

        Response {
            "users": [
                {
                "userId": "u123",
                "name": "Anjali",
                "age": 25,
                "bio": "Love traveling and coffee ☕",
                "photos": [
                    "https://cdn.app.com/u123/p1.jpg",
                    "https://cdn.app.com/u123/p2.jpg"
                ],
                "distance": 3.2,
                "interests": ["travel", "music"],
                "isVerified": true,
                "lastActive": "2026-04-16T10:20:00Z"
                },
                {
                "userId": "u456",
                "name": "Riya",
                "age": 27,
                "bio": "Fitness enthusiast 💪",
                "photos": [
                    "https://cdn.app.com/u456/p1.jpg"
                ],
                "distance": 7.8,
                "interests": ["gym", "yoga"],
                "isVerified": false,
                "lastActive": "2026-04-17T08:10:00Z"
                }
            ],
            "nextCursor": "eyJvZmZzZXQiOjIw..."
        }


    iii. Swipe

        Endpoint: POST /swipe/{userId}

        Payload: {
            decision: "yes" | "no"
        }



4. Database Schema

    i. Profile (Postgres)

        id
        name
        minAgePreference
        maxAgePreference
        genderPreference
        maxDistance
        latestLocation


    ii. Swipe (Cassandra)

        user1
        user2
        like: yes|no
        createdAt


    iii. Match

        user1
        user2
        createdAt

    
    iv. Redis

        key: user1_user2
        value: {
            user1_swipe: true,
            user2_swipe: true
        }




5. High Level Design


    i. Users can create a profile with preferences (e.g. age range, interests) and specify a maximum distance.
    ii. Users can view a stack of potential matches
    iii. Users can swipe right / left on profiles one-by-one, to express "yes" or "no" on other users
    iv. Users get a match notification if they mutually swipe on each other



6. Deep Dive

    i. How can we ensure that swiping is consistent and low latency?

        ans: Redis is a better fit for handling the consistency requirements of our swipe matching logic.By using Redis's atomic operations via Lua scripts


    ii. How can we ensure low latency for feed/stack generation?

        ans: Combination of Pre-computation and Indexed database

            - The good news is we can have the best of both worlds by combining the benefits of both pre-computation and real-time querying using an indexed database.
            - We periodically pre-compute and cache feeds for users based on their preferences and locations. When a user opens the app, they receive this cached feed instantly, allowing for immediate interaction without any delay.
            - As users swipe through and potentially exhaust their cached feed, the system seamlessly transitions to generating additional matches in real-time. This is achieved by leveraging Elasticsearch of the indexed database we discussed above.
            - By combining the two methods, we maintain low latency throughout the user’s session. The initial cached feed provides instant access, while the indexed database ensures that even the most active users receive fresh and relevant matches without noticeable delays.
            - We can also trigger the refresh of the stack when a user has a few profiles left to swipe through. This way, as far as the user is concerned, the stack seemed infinite.


        How do we avoid stale feeds?
            Caching feeds of users might result in us suggesting "stale" profiles.
            A stale profile is defined as one that no longer fits the filter criteria for a user.
            Below are some examples of the ways a profile in a feed might become stale:
            A user suggested in the feed might have changed locations and is no longer close enough to fit the feed filter criteria.
            A user suggested in the feed might change their profile (e.g. changed interests) and no longer fits the feed filter criteria.
            The above are real problems that might lead to a bad UX if the user sees a profile that doesn't actually match their preferred filters.
            To solve this issue, we might consider having a strict TTL for cached feeds (< 1h) and re-compute the feed via a background job on a schedule.
            We also might pre-computing feeds only for truly active users, vs. for all users.
            Doing upfront work for a user feed several times a day will be expensive at scale, so we might "warm" these caches only for users we know will eventually use the cached profiles.
            A benefit of this approach is that several parameters are tunable: the TTL for cached profiles, the number of profiles cached, the set of users we are caching feeds for, etc.

        
            A few user-triggered actions might also lead to stale profiles in the feed:
                The user being served the feed changes their filter criteria, resulting in profiles in the cached feed becoming stale.
                The user being served the feed changes their location significantly (e.g. they go to a different neighborhood or city), resulting in profiles in the cached feed becoming stale.
            All of the above are interactions that could trigger a feed refresh in the background, so that the feed is ready for the user if they choose to start swiping shortly after.


        
        How can the system avoid showing user profiles that the user has previously swiped on?

            ans: Cache + Contains Check + Bloom Filter

                We might consider building on top of our previous approach even more.
                For users with large swipe histories, we might consider storing a bloom filter.
                If a user exceeds a swipe history of a certain size (a size that would make storage in a cache unwieldy or "contains" checks slow during a query), we can build and cache a bloom filter for that user and use it in the filtering process.
                A bloom filter would sometimes yield false positives for swipes, meaning we'd sometimes assume a user swiped on a profile that they didn't swipe on. However, the bloom filter would never generate false negatives, meaning we'd never say a user hadn't swiped on a profile they actually did swipe on.
                This means we'd successfully avoid re-showing profiles, but there might be a small number of profiles that we might never show the user, due to false positives. Bloom filters have tunable error percentages that are usually tied to how much space they take up, so this is something that could be tuned to promote low false positives, reasonable space consumption, and fast filtering of profiles during feed building.