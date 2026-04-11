const { time } = require("console")

class SlidingWindowLog {
    constructor(windowSize, maxRequests){
        this.windowSize = windowSize
        this.maxRequests = maxRequests
        this.timestamps = []
    }

    allowRequest() {
        const currentTime = Date.now()

        const oneMinWindow = currentTime - (this.windowSize*1000)

        while(this.timestamps.length > 0){
            if(this.timestamps[0] <= oneMinWindow) {
                this.timestamps.shift()
            } else {
                break
            }
        }

        if(this.timestamps.length < this.maxRequests) {
            this.timestamps.push(currentTime)
            return true
        }
        return false
    }
}



const obj = new SlidingWindowLog(5, 5)

for(let i=0; i<15; i++){
    console.log(obj.allowRequest())
}

Promise.resolve(setTimeout(()=>{
    console.log(obj.allowRequest())
}, 4000))