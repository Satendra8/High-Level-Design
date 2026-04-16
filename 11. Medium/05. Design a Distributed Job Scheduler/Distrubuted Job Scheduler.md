A distributed job scheduler is a system designed to manage, schedule, and execute tasks (referred to as "jobs") across multiple computers or nodes in a distributed network.

Distributed job schedulers are used for automating and managing large-scale tasks like batch processing, report generation, and orchestrating complex workflows across multiple nodes.


1. Requiremment Clarification

    a. Functional Requiremment

        -> Users can submit one-time or periodic jobs for execution.
        -> Users can cancel the submitted jobs.
        -> The system should distribute jobs across multiple worker nodes for execution.
        -> The system should provide monitoring of job status (queued, running, completed, failed).
        -> The system should prevent the same job from being executed multiple times concurrently.


    b. Non-Functional Requirements:

        -> Scalability: The system should be able to schedule and execute millions of jobs.
        -> High Availability: The system should be fault-tolerant with no single point of failure. If a worker node fails, the system should reschedule the job to other available nodes.
        -> Latency: Jobs should be scheduled and executed with minimal delay.
        -> Consistency: Job results should be consistent, ensuring that jobs are executed once (or with minimal duplication).



2. Metrices

    Total users: 10 million
    Active users/day: 1 million
    Jobs created per user/day: 2
    👉 Total jobs/day = 2 million jobs/day
    Peak traffic factor: 3x
    👉 Peak QPS = (2M / 86400) * 3 ≈ 69 QPS


3. Database Schema

    JobTable

        This table stores the metadata of the job, including job id, user id, frequency, payload, execution time, retry count and status (pending, running, completed, failed).

        jobId
        userId
        jobName: (eg: data backup, daily report)
        frequency: (eg: once, daily)
        status: (eg: pedning, running)
        payload
        retryCount
        maxRetries
        executionTime


    JobExecution Table

        Jobs can be executed multiple times in case of failures.

        This table tracks the execution attempts for each job, storing information like execution id, start time, end time, worker id, status and error message.

        If a job fails and is retried, each attempt will be logged here.


        exectutionId
        jobId
        workerId
        startTime
        endTime
        status: (eg: failed, running, completed)
        errorMessage: (eg: TimeOutError, null)



    JobSchedules

        The Schedules Table stores scheduling details for each job, including the next_run_time.

            -> For one-time jobs, the next_run_time is the same as the job’s execution time, and the last_run_time remains null.

            -> For recurring jobs, the next_run_time is updated after each execution to reflect the next scheduled run.

        jobId
        nextRunTime
        lastRunTime


    
    Worker Table

        The Worker Node Table stores information about each worker node, including its ip address, status, last heartbeat, capacity and current load.

        workerId
        ipAddress
        status
        lastHeartbeat
        capacity
        currentLoad



4. API Design

    i. Submit Job

        Endpoint: POST /jobs

        Payload: {
            Job name
            Frequency (One-time, Daily)
            Execution time
            Job payload: {
                "type": "DELETE_EXPIRED_SESSIONS",
                "expiryThresholdDays": 30,
                "batchSize": 1000
            }
        }

    
    ii. Get Job Status

        Endpoint: GET /jobs/{job_id}

        Response: {
            jobId: 123,
            status: (eg: failed, running, completed, cancelled)
        }


    iii. Cancel Job

        Endpoint: DELETE /jobs/{job_id}

        Response: {
            jobId: 123
            message: "Job cancelled"
        }


    iv. List Pending Jobs

        Endpoint: GET /jobs?status=pending&user_id=u003

        Response: [
            {
                jobId: 123,
                jobName: 'Report'
            },
            {
                jobId: 345,
                jobName: 'Sync Inventory'
            },
        ]


    v. Get Jobs Running on a Worker

        Endpoint: GET /job/executions?worker_id=w001&status=running

        Response: [
            {
                jobId: 123,
                jobName: 'Report'
            },
            {
                jobId: 345,
                jobName: 'Sync Inventory'
            },
        ]




5. High Level Design


    i. Job Submission Service
        The Job Submission Service is the entry point for clients to interact with the system.

        It provides an interface for users or services to submit, update, or cancel jobs via APIs.

        This layer exposes a RESTful API that accepts job details such as:

            Job name
            Frequency (One-time, Daily)
            Execution time
            Job payload (task details)

        It saves job metadata (e.g., execution_time, frequency, status = pending) in the Job Store (a database) and returns a unique Job ID to the client.


    ii. Job Store

        The Job Store is responsible for persisting job information and maintaining the current state of all jobs and workers in the system.


    iii. Scheduling Service

        The Scheduling Service is responsible for selecting jobs for execution based on their next_run_time in the Job Schedules Table.


        It periodically queries the table for jobs scheduled to run at the current minute:

        SELECT * FROM JobSchedulesTable WHERE next_run_time = 1726110000;

        Once the due jobs are retrieved, they are pushed to the Distributed Job Queue for worker nodes to execute.

        Simultaneously, the status in Job Table is updated to SCHEDULED.


    iv. Distributed Job Queue

        The Distributed Job Queue (e.g., Kafka, RabbitMQ) acts as a buffer between the Scheduling Service and the Execution Service, ensuring that jobs are distributed efficiently to available worker nodes.

        It holds the jobs and allows the execution service to pull jobs and assign it to worker nodes.


    v. Execution Service

        The Execution Service is responsible for running the jobs on worker nodes and updating the results in the Job Store.

        It consists of a coordinator and a pool of worker nodes.


        Coordinator: A coordinator (or orchestrator) node takes responsibility for:


            -> Assigning jobs: Distributes jobs from the queue to the available worker nodes.
            -> Managing worker nodes: Tracks the status, health, capacity, and workload of active workers.
            -> Handling worker node failures: Detects when a worker node fails and reassigns its jobs to other healthy nodes.
            -> Load balancing: Ensures the workload is evenly distributed across worker nodes based on available resources and capacity.


        Worker Nodes: Worker nodes are responsible for executing jobs and updating the Job Store with the results (e.g., completed, failed, output).

            -> When a worker is assigned a job, it creates a new entry in the Job Execution Table with the job’s status set to running and begins execution.
            -> After execution is finished, the worker updates the job’s final status (e.g., completed or failed) along with any output in both the Jobs and Job Execution Table.
            -> If a worker fails during execution, the coordinator re-queues the job in the distributed job queue, allowing another worker to pick it up and complete it.
