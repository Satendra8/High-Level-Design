1. Requiremment Clarification

    a. Functional Requiremment

        -> Post (Image, Video)
        -> Like, Comment and Share
        -> Add Friends
        -> See Timeline
        -> See a User's Post, Profile
        -> Activity Log - about likes, comments, and shares

    
    b. Non Funcitonal Requirement

        -> Read heavy - read to write ratio is very high
        -> Fast rendering and posting
        -> Lag is Ok, but latency should be low - it is ok if we get notification about someone’s post a few minutes late, but once received it should render almost instantaneously
        -> Access pattern for posts - perform optimization such that media content is easily accessible when the post has maximum interaction
        -> Globally available - on a variety of devices, support multiple languages, and all sorts of internet bandwidth
        -> Scalable


    
2. Metrices (Numbers)

    1.7B DAU     |    95% mobile
    2.6B MAU     |

    Events/Min

        - 150k images
        - 300k statuses
        - 500k commnents



3. API Design
    

    i. Create Post

        Endpoint: POST /api/v1/posts

        Payload:{
            "userId": "123",
            "text": "Hello world",
            "mediaUrls": ["img1.jpg"],
            "visibility": "public"
        }


        Response: {
            "postId": "p789",
            "createdAt": "timestamp",
            "status": "success"
        }

    
    ii. Get Feed

        Endpoint: GET /api/v1/feed?cursor=abc&limit=10

        Response: {
            "posts": [
                {
                "postId": "p1",
                "userId": "123",
                "text": "Hello",
                "likes": 10,
                "comments": 2
                }
            ],
            "nextCursor": "xyz"
        }


    
    iii. Like Post

        Endpoint: POST /api/v1/posts/{postId}/like

        Payload: {
            "userId": "123"
        }

        Response: {
            "status": "liked"
        }


    iv. Comment

        Endpoint: POST /api/v1/posts/{postId}/comments

        Payload: {
            "userId": "123",
            "text": "Nice post!"
        }

        Response: {
            "commentId": "c456",
            "status": "success"
        }

    
    v. Add Friend

        Endpoint: POST /api/v1/friends/request

        Payload: {
            "fromUserId": "123",
            "toUserId": "456"
        }

        Response: {
            "status": "request_sent"
        }

    
    vi. User Profile

        Endpoint: GET /api/v1/users/{userId}

        Response: {
            "userId": "123",
            "name": "Satendra",
            "friendsCount": 200
        }





4. Database Schema


    i. Users (MySQL - relational)

        Users (
            id BIGINT PRIMARY KEY,
            name VARCHAR,
            email VARCHAR UNIQUE,
            created_at TIMESTAMP
        )

    
    ii. Connections / Friends (MySQL)


        Friends (
            user_id BIGINT,
            friend_id BIGINT,
            status VARCHAR,  -- pending / accepted
            created_at TIMESTAMP,
            PRIMARY KEY (user_id, friend_id)
        )

    iii. Posts (Cassandra)

        Posts (
            user_id BIGINT,
            post_id BIGINT,
            text TEXT,
            media_urls LIST<TEXT>,
            created_at TIMESTAMP,
            PRIMARY KEY (user_id, created_at, post_id)
        ) WITH CLUSTERING ORDER BY (created_at DESC);

    
    iv. Likes (Cassandra)

        Likes (
            post_id BIGINT,
            user_id BIGINT,
            created_at TIMESTAMP,
            PRIMARY KEY (post_id, user_id)
        )


    v. Comments (Cassandra)

        Comments (
            post_id BIGINT,
            comment_id BIGINT,
            user_id BIGINT,
            text TEXT,
            created_at TIMESTAMP,
            PRIMARY KEY (post_id, created_at, comment_id)
        ) WITH CLUSTERING ORDER BY (created_at DESC);

    

    vi. Feed (Cassandra)

        Feed (
            user_id BIGINT,
            post_id BIGINT,
            created_at TIMESTAMP,
            PRIMARY KEY (user_id, created_at, post_id)
        ) WITH CLUSTERING ORDER BY (created_at DESC);




5. HLD

    i. User Onboarding, Add Friend

        Components

            User Service
            Kafka
            Graph Service : Users = nodes, Relationships (friends, followers) = edges
            Redis
            MySql Cluster


    ii. Post Flow

        Components

            Post Ingestion Service

                a. save the post in S3 and cassandra
                b. send the post in kafka for analytics (analytics will validate post and classify into category and add tags)


    iii. User Profile and Timeline (Feed)

        Components

            Post PreProcess: It decides which user has same intrest as post, who is the relevent user to show this post

            Aggregated Timeline Cassandra: One or more day old post will be store in Cassandra and when user scroll down then fetch from here user1: [post1, post2, post3........]

            Redis: Store today timeline in redis, it stores user1: [post1, post2, post3........], for celebrity we use pull model



            Live

                Socket: It send the live data via socket to online user

                Kafka: For offline users it publish into kafka, and furtur it will be moved to post processor

    
    iv. Like and Comment

        Components

            Cassandra: Like and Comments will be saved

            Kafka: After each Like and Comment, we publish event to Kafka

            Activity Tracker: This will be stored is Cassandra, It stores are the actvity done by user

            Search: When a new post is created or a new Profile is created, we will store it in Elastic search for searching

            Spark Streaming, Hadoop, Trends:

                i. Post which has many likes and many comments will me marked trending
                ii. Trending posts will be cached


