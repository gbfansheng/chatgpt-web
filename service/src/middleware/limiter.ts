import { rateLimit } from 'express-rate-limit'
import { isNotEmptyString } from '../utils/is'

const MAX_REQUEST_PER_HOUR = process.env.MAX_REQUEST_PER_HOUR

const maxCount = (isNotEmptyString(MAX_REQUEST_PER_HOUR) && !isNaN(Number(MAX_REQUEST_PER_HOUR)))
  ? parseInt(MAX_REQUEST_PER_HOUR)
  : 0 // 0 means unlimited

const limiter = maxCount > 0
  ? rateLimit({
      windowMs: 60 * 60 * 1000,
      max: maxCount,
      statusCode: 200,
      message: async (req, res) => {
        res.send({ status: 'Fail', message: 'Too many request from this IP in 1 hour', data: null })
      },
    })
  : (req, res, next) => next() // 无限制时直接放行

export { limiter }
