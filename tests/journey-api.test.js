const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function availablePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error('Timed out waiting for condition');
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

function taipeiDateTime(timestamp) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function transitUserBenefitScore(result) {
  const suppliedScore = Number(result.userBenefitScore);
  if (Number.isFinite(suppliedScore)) return suppliedScore;
  return (Number(result.durationMinutes) || 0)
    + (Number(result.walkingMinutes) || 0) * 1.5
    + (Number(result.waitingMinutes) || 0) * 0.35
    + (Number(result.transferCount) || 0) * 12
    + (Number(result.detourKilometers) || 0) * 0.2
    + (Number(result.estimatedLegs) || 0) * 3;
}

function transitUserBenefitSort(left, right) {
  return transitUserBenefitScore(left) - transitUserBenefitScore(right);
}

test('public transit ranking compares overall user benefit instead of one field', () => {
  const shorterButMuchSlower = {
    durationMinutes: 120, walkingMinutes: 5, waitingMinutes: 5,
    transferCount: 1, detourKilometers: 0, estimatedLegs: 0
  };
  const balancedRoute = {
    durationMinutes: 70, walkingMinutes: 10, waitingMinutes: 5,
    transferCount: 1, detourKilometers: 5, estimatedLegs: 0
  };
  assert.ok(transitUserBenefitSort(balancedRoute, shorterButMuchSlower) < 0);

  const fasterButLongWalk = {
    durationMinutes: 60, walkingMinutes: 40, waitingMinutes: 0,
    transferCount: 1, detourKilometers: 0, estimatedLegs: 0
  };
  const slightlySlowerComfortableRoute = {
    durationMinutes: 75, walkingMinutes: 5, waitingMinutes: 5,
    transferCount: 1, detourKilometers: 1, estimatedLegs: 0
  };
  assert.ok(transitUserBenefitSort(slightlySlowerComfortableRoute, fasterButLongWalk) < 0);

  const otherwiseEqualFewerTransfers = {
    ...slightlySlowerComfortableRoute, transferCount: 0
  };
  assert.ok(transitUserBenefitSort(
    otherwiseEqualFewerTransfers, slightlySlowerComfortableRoute
  ) < 0);
});

test('journey APIs cache fixed/live data separately and use their assigned pools', async () => {
  const now = Date.now();
  const queryTime = taipeiDateTime(now + 60_000);
  const departedTime = taipeiDateTime(now - 5 * 60_000);
  const departedArrivalTime = taipeiDateTime(now + 2 * 60_000);
  const originTime = taipeiDateTime(now + 5 * 60_000);
  const destinationTime = taipeiDateTime(now + 20 * 60_000);
  const today = taipeiDateTime(now).date;
  let plannedQueryTimestamp = Date.parse(`${today}T08:00:00+08:00`);
  if (plannedQueryTimestamp <= now + 60_000) plannedQueryTimestamp += 24 * 60 * 60 * 1000;
  const plannedQueryTime = taipeiDateTime(plannedQueryTimestamp);
  const transferDepartureTime = taipeiDateTime(plannedQueryTimestamp + 30 * 60_000);
  const transferArrivalTime = taipeiDateTime(plannedQueryTimestamp + 60 * 60_000);
  const xinshiDepartureTime = taipeiDateTime(plannedQueryTimestamp + 25 * 60_000);
  const xinshiArrivalTime = taipeiDateTime(plannedQueryTimestamp + 52 * 60_000);
  const connectionDepartureTime = taipeiDateTime(plannedQueryTimestamp + 75 * 60_000);
  const connectionArrivalTime = taipeiDateTime(plannedQueryTimestamp + 120 * 60_000);
  const southHsrDepartureTime = taipeiDateTime(plannedQueryTimestamp + 70 * 60_000);
  const southHsrArrivalTime = taipeiDateTime(plannedQueryTimestamp + 85 * 60_000);
  const reverseHsrDepartureTime = taipeiDateTime(plannedQueryTimestamp + 90 * 60_000);
  const reverseHsrArrivalTime = taipeiDateTime(plannedQueryTimestamp + 105 * 60_000);
  const secondSouthTraDepartureTime = taipeiDateTime(plannedQueryTimestamp + 95 * 60_000);
  const secondSouthTraArrivalTime = taipeiDateTime(plannedQueryTimestamp + 125 * 60_000);
  const calls = {
    fixedStations: 0,
    fixedTimetables: 0,
    fixedFares: 0,
    realtimeBus: 0,
    realtimeTrain: 0,
    busEtaFilters: [],
    busStopOfRouteSelects: [],
    busRouteSelects: [],
    busScheduleSelects: [],
    metroStations: 0,
    metroRoutes: 0,
    metroTimetables: 0,
    metroFares: 0,
    metroTravelTimes: 0,
    realtimeMetro: 0,
    parkingLots: 0,
    parkingAvailability: 0,
    roadRoutes: 0,
    roadProfiles: [],
    roadMethods: [],
    roadCustomModels: [],
    roadSnapPreventions: [],
    roadAlternativeLimits: [],
    roadAlgorithms: []
  };
  let delayNextRoadRoute = false;
  let failNextBusEta = false;
  let omitBusSchedules = false;

  const mock = http.createServer((request, response) => {
    if (request.url === '/token') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const clientId = new URLSearchParams(body).get('client_id');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ access_token: `${clientId}-token`, expires_in: 900 }));
      });
      return;
    }
    if (request.url.startsWith('/graphhopper/route')) {
      calls.roadRoutes += 1;
      const routeRequest = new URL(request.url, 'http://localhost');
      const sendRoadRoute = (requestPayload = {}) => {
        calls.roadProfiles.push(requestPayload.profile || routeRequest.searchParams.get('profile'));
        calls.roadMethods.push(request.method);
        calls.roadCustomModels.push(requestPayload.custom_model || null);
        calls.roadSnapPreventions.push(routeRequest.searchParams.getAll('snap_prevention'));
        calls.roadAlternativeLimits.push(routeRequest.searchParams.get('alternative_route.max_paths'));
        calls.roadAlgorithms.push(routeRequest.searchParams.get('algorithm'));
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          paths: [{
            distance: 10_000,
            time: 300_000,
            points: { type: 'LineString', coordinates: [[121.517, 25.0478], [121.4638, 25.0143]] },
            instructions: [{
              text: '沿忠孝西路行駛', street_name: '忠孝西路', distance: 10_000,
              time: 300_000, interval: [0, 1]
            }]
          }, {
            distance: 12_000,
            time: 420_000,
            points: { type: 'LineString', coordinates: [[121.517, 25.0478], [121.48, 25.03], [121.4638, 25.0143]] },
            instructions: [{
              text: '沿替代道路行駛', street_name: '替代道路', distance: 12_000,
              time: 420_000, interval: [0, 2]
            }]
          }]
        }));
      };
      const completeRoadRequest = (requestPayload = {}) => {
        if (delayNextRoadRoute) {
          delayNextRoadRoute = false;
          setTimeout(() => sendRoadRoute(requestPayload), 7_500);
        } else {
          sendRoadRoute(requestPayload);
        }
      };
      if (request.method === 'POST') {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => completeRoadRequest(JSON.parse(body || '{}')));
      } else {
        completeRoadRequest();
      }
      return;
    }
    if (request.url.startsWith('/reverse')) {
      const requestUrl = new URL(request.url, 'http://localhost');
      const latitude = Number(requestUrl.searchParams.get('lat'));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(latitude < 25 ? {
        display_name: '竹北市，新竹縣，臺灣',
        address: { county: '新竹縣', city: '竹北市', suburb: '斗崙里' }
      } : {
        display_name: '信義區，臺北市，臺灣',
        address: { city: '臺北市', borough: '信義區', suburb: '西村里' }
      }));
      return;
    }

    const authorization = request.headers.authorization;
    const isRealtime = request.url.includes('/v2/Bus/RealTimeByFrequency/')
      || request.url.includes('/v2/Bus/EstimatedTimeOfArrival/')
      || request.url.includes('/v3/Rail/TRA/TrainLiveBoard')
      || request.url.includes('/v2/Rail/Metro/Live');

    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.url.includes('/v2/Bus/RealTimeByFrequency/')) {
      calls.realtimeBus += 1;
      response.end(JSON.stringify([{
        PlateNumb: 'BUS-001', RouteUID: 'R1', RouteName: { Zh_tw: '測試公車' },
        Direction: 0, StopUID: 'STOP-A', StopSequence: 1, BusStatus: 0,
        BusPosition: { PositionLat: 25.0478, PositionLon: 121.5170 },
        GPSTime: new Date().toISOString()
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/Station/City/Kaohsiung')) {
      response.end(JSON.stringify([{
        StationUID: 'KHH-RAIL', StationName: { Zh_tw: '高雄車站' },
        StationPosition: { PositionLat: 22.6397, PositionLon: 120.302 },
        Stops: [{ StopUID: 'KHH-STOP-RAIL' }]
      }, {
        StationUID: 'KHH-HOTEL', StationName: { Zh_tw: '漢來飯店站' },
        StationPosition: { PositionLat: 22.6195179, PositionLon: 120.2966363 },
        Stops: [{ StopUID: 'KHH-STOP-HOTEL' }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/Station/City/')) {
      response.end(JSON.stringify([
        {
          StationUID: 'BSTA', StationName: { Zh_tw: '公車起點' },
          StationPosition: { PositionLat: 25.0478, PositionLon: 121.5170 },
          Stops: [{ StopUID: 'STOP-A' }]
        },
        {
          StationUID: 'BSTO', StationName: { Zh_tw: '社區接駁站' },
          StationPosition: { PositionLat: 25.06, PositionLon: 121.53 },
          Stops: [{ StopUID: 'STOP-O' }]
        },
        {
          StationUID: 'BSTB', StationName: { Zh_tw: '公車終點' },
          StationPosition: { PositionLat: 25.0143, PositionLon: 121.4638 },
          Stops: [{ StopUID: 'STOP-B' }]
        },
        {
          StationUID: 'BSTX', StationName: { Zh_tw: '公車轉乘站' },
          StationPosition: { PositionLat: 25.03, PositionLon: 121.49 },
          Stops: [{ StopUID: 'STOP-X' }]
        },
        {
          StationUID: 'BSTC', StationName: { Zh_tw: '公車新終點' },
          StationPosition: { PositionLat: 25.025, PositionLon: 121.45 },
          Stops: [{ StopUID: 'STOP-C' }]
        }
      ]));
      return;
    }
    if (request.url.includes('/v2/Bus/StopOfRoute/City/Kaohsiung')) {
      calls.busStopOfRouteSelects.push(new URL(request.url, 'http://localhost').searchParams.get('$select'));
      response.end(JSON.stringify([{
        RouteUID: 'KHH-R1', RouteName: { Zh_tw: '高雄車站接駁' }, Direction: 0,
        Stops: [{
          StopUID: 'KHH-STOP-RAIL', StopName: { Zh_tw: '高雄車站' }, StopSequence: 1,
          StopPosition: { PositionLat: 22.6397, PositionLon: 120.302 }
        }, {
          StopUID: 'KHH-STOP-HOTEL', StopName: { Zh_tw: '漢來飯店站' }, StopSequence: 2,
          StopPosition: { PositionLat: 22.6195179, PositionLon: 120.2966363 }
        }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/StopOfRoute/City/')) {
      calls.busStopOfRouteSelects.push(new URL(request.url, 'http://localhost').searchParams.get('$select'));
      response.end(JSON.stringify([{
        RouteUID: 'R0', RouteName: { Zh_tw: '車站接駁' }, Direction: 0,
        Stops: [
          {
            StopUID: 'STOP-O', StopName: { Zh_tw: '社區接駁站' }, StopSequence: 1,
            StopPosition: { PositionLat: 25.06, PositionLon: 121.53 }
          },
          {
            StopUID: 'STOP-A', StopName: { Zh_tw: '公車起點' }, StopSequence: 2,
            StopPosition: { PositionLat: 25.0478, PositionLon: 121.5170 }
          }
        ]
      }, {
        RouteUID: 'R1', RouteName: { Zh_tw: '測試公車' }, Direction: 0,
        Stops: [
          {
            StopUID: 'STOP-A', StopName: { Zh_tw: '公車起點' }, StopSequence: 1,
            StopPosition: { PositionLat: 25.0478, PositionLon: 121.5170 }
          },
          {
            StopUID: 'STOP-B', StopName: { Zh_tw: '公車終點' }, StopSequence: 2,
            StopPosition: { PositionLat: 25.0143, PositionLon: 121.4638 }
          },
          {
            StopUID: 'STOP-X', StopName: { Zh_tw: '公車轉乘站' }, StopSequence: 3,
            StopPosition: { PositionLat: 25.03, PositionLon: 121.49 }
          }
        ]
      }, {
        RouteUID: 'R2', RouteName: { Zh_tw: '接駁公車' }, Direction: 0,
        Stops: [
          { StopUID: 'STOP-X', StopName: { Zh_tw: '公車轉乘站' }, StopSequence: 1,
            StopPosition: { PositionLat: 25.03, PositionLon: 121.49 } },
          { StopUID: 'STOP-C', StopName: { Zh_tw: '公車新終點' }, StopSequence: 2,
            StopPosition: { PositionLat: 25.025, PositionLon: 121.45 } }
        ]
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/Route/City/Kaohsiung')) {
      calls.busRouteSelects.push(new URL(request.url, 'http://localhost').searchParams.get('$select'));
      response.end(JSON.stringify([{
        RouteUID: 'KHH-R1', RouteName: { Zh_tw: '高雄車站接駁' },
        TicketPriceDescriptionZh: '全票 12 元'
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/Route/City/')) {
      calls.busRouteSelects.push(new URL(request.url, 'http://localhost').searchParams.get('$select'));
      response.end(JSON.stringify([{
        RouteUID: 'R0', RouteName: { Zh_tw: '車站接駁' },
        TicketPriceDescriptionZh: '全票 15 元'
      }, {
        RouteUID: 'R1', RouteName: { Zh_tw: '測試公車' },
        TicketPriceDescriptionZh: '全票 15 元'
      }, {
        RouteUID: 'R2', RouteName: { Zh_tw: '接駁公車' },
        TicketPriceDescriptionZh: '全票 20 元'
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/Schedule/City/Kaohsiung')) {
      calls.busScheduleSelects.push(new URL(request.url, 'http://localhost').searchParams.get('$select'));
      if (omitBusSchedules) {
        response.end('[]');
        return;
      }
      response.end(JSON.stringify([{
        RouteUID: 'KHH-R1', Direction: 0,
        Frequencys: [{ StartTime: '00:00', EndTime: '23:59', MinHeadwayMins: 10, MaxHeadwayMins: 15 }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/Schedule/City/')) {
      calls.busScheduleSelects.push(new URL(request.url, 'http://localhost').searchParams.get('$select'));
      if (omitBusSchedules) {
        response.end('[]');
        return;
      }
      response.end(JSON.stringify([{
        RouteUID: 'R0', Direction: 0,
        Frequencys: [{ StartTime: '00:00', EndTime: '23:59', MinHeadwayMins: 10, MaxHeadwayMins: 15 }]
      }, {
        RouteUID: 'R1', Direction: 0,
        Frequencys: [{ StartTime: '00:00', EndTime: '23:59', MinHeadwayMins: 10, MaxHeadwayMins: 15 }]
      }, {
        RouteUID: 'R2', Direction: 0,
        Frequencys: [{ StartTime: '00:00', EndTime: '23:59', MinHeadwayMins: 12, MaxHeadwayMins: 20 }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Bus/EstimatedTimeOfArrival/City/')) {
      calls.busEtaFilters.push(new URL(request.url, 'http://localhost').searchParams.get('$filter'));
      if (failNextBusEta) {
        failNextBusEta = false;
        response.destroy();
        return;
      }
      response.end(JSON.stringify([{
        RouteUID: 'R1', RouteName: { Zh_tw: '測試公車' }, Direction: 0,
        StopUID: 'STOP-A', PlateNumb: 'BUS-AT-STOP', EstimateTime: -120, StopStatus: 0
      }, {
        RouteUID: 'R0', RouteName: { Zh_tw: '車站接駁' }, Direction: 0,
        StopUID: 'STOP-O', PlateNumb: 'BUS-FEEDER', EstimateTime: 120, StopStatus: 0
      }, {
        RouteUID: 'R1', RouteName: { Zh_tw: '測試公車' }, Direction: 0,
        StopUID: 'STOP-A', PlateNumb: 'BUS-LATE', EstimateTime: 420, StopStatus: 0
      }, {
        RouteUID: 'R1', RouteName: { Zh_tw: '測試公車' }, Direction: 0,
        StopUID: 'STOP-A', PlateNumb: 'BUS-001', EstimateTime: 120, StopStatus: 0
      }, {
        RouteUID: 'R2', RouteName: { Zh_tw: '接駁公車' }, Direction: 0,
        StopUID: 'STOP-X', PlateNumb: 'BUS-TRANSFER', EstimateTime: 300, StopStatus: 0
      }]));
      return;
    }
    if (request.url.includes('/v3/Rail/TRA/Station')) {
      calls.fixedStations += 1;
      response.end(JSON.stringify({ Stations: [
        {
          StationID: '1000', StationName: { Zh_tw: '臺北' },
          LocationCity: '臺北市',
          StationPosition: { PositionLat: 25.0478, PositionLon: 121.5170 }
        },
        {
          StationID: '1004', StationName: { Zh_tw: '萬華' },
          LocationCity: '台北',
          StationPosition: { PositionLat: 25.04, PositionLon: 121.499 }
        },
        {
          StationID: '1001', StationName: { Zh_tw: '板橋' },
          LocationCity: '新北市',
          StationPosition: { PositionLat: 25.0143, PositionLon: 121.4638 }
        },
        {
          StationID: '1002', StationName: { Zh_tw: '新竹' },
          LocationCity: '新竹市',
          StationPosition: { PositionLat: 24.8016, PositionLon: 120.9716 }
        },
        {
          StationID: '1003', StationName: { Zh_tw: '苗栗' },
          LocationCity: '苗栗縣',
          StationPosition: { PositionLat: 24.57, PositionLon: 120.822 }
        },
        {
          StationID: '4090', StationName: { Zh_tw: '新市' },
          LocationCity: '臺南市',
          StationPosition: { PositionLat: 23.0684, PositionLon: 120.2902 }
        },
        {
          StationID: '4100', StationName: { Zh_tw: '南科' },
          LocationCity: '臺南市',
          StationPosition: { PositionLat: 23.1072, PositionLon: 120.3016 }
        },
        {
          StationID: '4390', StationName: { Zh_tw: '三塊厝' },
          LocationCity: '高雄市',
          StationPosition: { PositionLat: 22.6548, PositionLon: 120.2947 }
        },
        {
          StationID: '4400', StationName: { Zh_tw: '高雄' },
          LocationCity: '高雄市',
          StationPosition: { PositionLat: 22.6397, PositionLon: 120.302 }
        }
      ] }));
      return;
    }
    if (request.url.includes('/v3/Rail/TRA/DailyTrainTimetable/TrainDate/')) {
      calls.fixedTimetables += 1;
      response.end(JSON.stringify({ TrainTimetables: [{
        TrainInfo: { TrainNo: '099', TrainTypeName: { Zh_tw: '已離站測試車' } },
        StopTimes: [
          {
            StationID: '1000', StationName: { Zh_tw: '臺北' }, StopSequence: 1,
            ArrivalTime: departedTime.time, DepartureTime: departedTime.time
          },
          {
            StationID: '1001', StationName: { Zh_tw: '板橋' }, StopSequence: 2,
            ArrivalTime: departedArrivalTime.time, DepartureTime: departedArrivalTime.time
          }
        ]
      }, {
        TrainInfo: { TrainNo: '101', TrainTypeName: { Zh_tw: '自強號' } },
        StopTimes: [
          {
            StationID: '1000', StationName: { Zh_tw: '臺北' }, StopSequence: 1,
            ArrivalTime: originTime.time, DepartureTime: originTime.time
          },
          {
            StationID: '1001', StationName: { Zh_tw: '板橋' }, StopSequence: 2,
            ArrivalTime: destinationTime.time, DepartureTime: destinationTime.time
          }
        ]
      }, {
        TrainInfo: { TrainNo: '102', TrainTypeName: { Zh_tw: '自強號' } },
        StopTimes: [
          {
            StationID: '1000', StationName: { Zh_tw: '臺北' }, StopSequence: 1,
            ArrivalTime: transferDepartureTime.time, DepartureTime: transferDepartureTime.time
          },
          {
            StationID: '1001', StationName: { Zh_tw: '板橋' }, StopSequence: 2,
            ArrivalTime: transferArrivalTime.time, DepartureTime: transferArrivalTime.time
          }
        ]
      }, {
        TrainInfo: { TrainNo: '201', TrainTypeName: { Zh_tw: '區間車' } },
        StopTimes: [
          { StationID: '1000', StationName: { Zh_tw: '臺北' }, StopSequence: 1,
            ArrivalTime: transferDepartureTime.time, DepartureTime: transferDepartureTime.time },
          { StationID: '1002', StationName: { Zh_tw: '新竹' }, StopSequence: 2,
            ArrivalTime: transferArrivalTime.time, DepartureTime: transferArrivalTime.time }
        ]
      }, {
        TrainInfo: { TrainNo: '202', TrainTypeName: { Zh_tw: '區間車' } },
        StopTimes: [
          { StationID: '1002', StationName: { Zh_tw: '新竹' }, StopSequence: 1,
            ArrivalTime: connectionDepartureTime.time, DepartureTime: connectionDepartureTime.time },
          { StationID: '1003', StationName: { Zh_tw: '苗栗' }, StopSequence: 2,
            ArrivalTime: connectionArrivalTime.time, DepartureTime: connectionArrivalTime.time }
        ]
      }, {
        TrainInfo: { TrainNo: '300', TrainTypeName: { Zh_tw: '區間快' } },
        StopTimes: [
          { StationID: '4090', StationName: { Zh_tw: '新市' }, StopSequence: 1,
            ArrivalTime: xinshiDepartureTime.time, DepartureTime: xinshiDepartureTime.time },
          { StationID: '4400', StationName: { Zh_tw: '高雄' }, StopSequence: 2,
            ArrivalTime: xinshiArrivalTime.time, DepartureTime: xinshiArrivalTime.time }
        ]
      }, {
        TrainInfo: { TrainNo: '301', TrainTypeName: { Zh_tw: '區間快' } },
        StopTimes: [
          { StationID: '4100', StationName: { Zh_tw: '南科' }, StopSequence: 1,
            ArrivalTime: transferDepartureTime.time, DepartureTime: transferDepartureTime.time },
          { StationID: '4390', StationName: { Zh_tw: '三塊厝' }, StopSequence: 2,
            ArrivalTime: taipeiDateTime(plannedQueryTimestamp + 58 * 60_000).time,
            DepartureTime: taipeiDateTime(plannedQueryTimestamp + 58 * 60_000).time },
          { StationID: '4400', StationName: { Zh_tw: '高雄' }, StopSequence: 3,
            ArrivalTime: transferArrivalTime.time, DepartureTime: transferArrivalTime.time }
        ]
      }, {
        TrainInfo: { TrainNo: '302', TrainTypeName: { Zh_tw: '區間快' } },
        StopTimes: [
          { StationID: '4100', StationName: { Zh_tw: '南科' }, StopSequence: 1,
            ArrivalTime: secondSouthTraDepartureTime.time, DepartureTime: secondSouthTraDepartureTime.time },
          { StationID: '4400', StationName: { Zh_tw: '高雄' }, StopSequence: 2,
            ArrivalTime: secondSouthTraArrivalTime.time, DepartureTime: secondSouthTraArrivalTime.time }
        ]
      }] }));
      return;
    }
    if (request.url.includes('/v2/Rail/TRA/ODFare')) {
      calls.fixedFares += 1;
      response.end(JSON.stringify([{
        OriginStationID: '1000', DestinationStationID: '1001',
        Fares: [{ Price: 40 }, { Price: 80 }]
      }, {
        OriginStationID: '1000', DestinationStationID: '1002', Fares: [{ Price: 120 }]
      }, {
        OriginStationID: '1002', DestinationStationID: '1003', Fares: [{ Price: 70 }]
      }, {
        OriginStationID: '4090', DestinationStationID: '4400', Fares: [{ Price: 82 }]
      }, {
        OriginStationID: '4100', DestinationStationID: '4400', Fares: [{ Price: 88 }]
      }]));
      return;
    }
    if (request.url.includes('/v3/Rail/TRA/TrainLiveBoard')) {
      calls.realtimeTrain += 1;
      response.end(JSON.stringify({ TrainLiveBoards: [{
        TrainNo: '101', StationID: '1001', StationName: { Zh_tw: '板橋' },
        DelayTime: 2, UpdateTime: new Date().toISOString()
      }] }));
      return;
    }
    if (request.url.includes('/v2/Rail/THSR/Station')) {
      response.end(JSON.stringify([
        {
          StationUID: 'THSR-0990', StationID: '0990', StationName: { Zh_tw: '高鐵臺北' },
          StationPosition: { PositionLat: 25.0478, PositionLon: 121.5170 }
        },
        {
          StationUID: 'THSR-1000', StationID: '1000', StationName: { Zh_tw: '高鐵板橋' },
          StationPosition: { PositionLat: 25.0143, PositionLon: 121.4638 }
        },
        {
          StationUID: 'THSR-1060', StationID: '1060', StationName: { Zh_tw: '台南' },
          StationPosition: { PositionLat: 22.925077, PositionLon: 120.286201 }
        },
        {
          StationUID: 'THSR-1070', StationID: '1070', StationName: { Zh_tw: '左營' },
          StationPosition: { PositionLat: 22.687391, PositionLon: 120.307487 }
        }
      ]));
      return;
    }
    if (request.url.includes('/v2/Rail/THSR/DailyTimetable/TrainDate/')) {
      response.end(JSON.stringify([{
        DailyTrainInfo: { TrainNo: '0801' },
        StopTimes: [
          {
            StationID: '0990', StationName: { Zh_tw: '高鐵臺北' }, StopSequence: 1,
            ArrivalTime: originTime.time, DepartureTime: originTime.time
          },
          {
            StationID: '1000', StationName: { Zh_tw: '高鐵板橋' }, StopSequence: 2,
            ArrivalTime: destinationTime.time, DepartureTime: destinationTime.time
          }
        ]
      }, {
        DailyTrainInfo: { TrainNo: '0802' },
        StopTimes: [
          {
            StationID: '1060', StationName: { Zh_tw: '台南' }, StopSequence: 1,
            ArrivalTime: southHsrDepartureTime.time, DepartureTime: southHsrDepartureTime.time
          },
          {
            StationID: '1070', StationName: { Zh_tw: '左營' }, StopSequence: 2,
            ArrivalTime: southHsrArrivalTime.time, DepartureTime: southHsrArrivalTime.time
          }
        ]
      }, {
        DailyTrainInfo: { TrainNo: '0803' },
        StopTimes: [
          {
            StationID: '1070', StationName: { Zh_tw: '左營' }, StopSequence: 1,
            ArrivalTime: reverseHsrDepartureTime.time, DepartureTime: reverseHsrDepartureTime.time
          },
          {
            StationID: '1060', StationName: { Zh_tw: '台南' }, StopSequence: 2,
            ArrivalTime: reverseHsrArrivalTime.time, DepartureTime: reverseHsrArrivalTime.time
          }
        ]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/THSR/ODFare')) {
      response.end(JSON.stringify([{
        OriginStationID: '0990', DestinationStationID: '1000',
        Fares: [{ Price: 40 }]
      }, {
        OriginStationID: '1060', DestinationStationID: '1070',
        Fares: [{ Price: 150 }]
      }, {
        OriginStationID: '1070', DestinationStationID: '1060',
        Fares: [{ Price: 150 }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/Station/KRTC')) {
      calls.metroStations += 1;
      response.end(JSON.stringify([
        {
          StationUID: 'KRTC-R11', StationID: 'R11', StationName: { Zh_tw: '高雄車站' },
          StationPosition: { PositionLat: 22.6397, PositionLon: 120.302 }
        },
        {
          StationUID: 'KRTC-R9', StationID: 'R9', StationName: { Zh_tw: '中央公園' },
          StationPosition: { PositionLat: 22.6248, PositionLon: 120.3011 }
        },
        {
          StationUID: 'KRTC-R6', StationID: 'R6', StationName: { Zh_tw: '凱旋' },
          StationPosition: { PositionLat: 22.5967, PositionLon: 120.3151 }
        }
      ]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/StationOfRoute/KRTC')) {
      calls.metroRoutes += 1;
      response.end(JSON.stringify([{
        RouteID: 'R', LineID: 'R', RouteName: { Zh_tw: '高雄捷運紅線' }, Direction: 0,
        Stations: [
          { StationID: 'R11', StationName: { Zh_tw: '高雄車站' }, StopSequence: 1 },
          { StationID: 'R9', StationName: { Zh_tw: '中央公園' }, StopSequence: 2 },
          { StationID: 'R6', StationName: { Zh_tw: '凱旋' }, StopSequence: 3 }
        ]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/StationTimeTable/KRTC')) {
      calls.metroTimetables += 1;
      response.end(JSON.stringify([{
        StationID: 'R11', RouteID: 'R', Direction: 0,
        Timetables: [
          { DepartureTime: transferArrivalTime.time },
          { DepartureTime: connectionDepartureTime.time },
          { DepartureTime: taipeiDateTime(plannedQueryTimestamp + 90 * 60_000).time }
        ]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/ODFare/KRTC')) {
      calls.metroFares += 1;
      response.end(JSON.stringify([{
        OriginStationID: 'R11', DestinationStationID: 'R9', Fares: [{ Price: 20 }]
      }, {
        OriginStationID: 'R11', DestinationStationID: 'R6', Fares: [{ Price: 20 }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/S2STravelTime/KRTC')) {
      calls.metroTravelTimes += 1;
      response.end(JSON.stringify([{
        RouteID: 'R', TravelTimes: [{
          FromStationID: 'R11', ToStationID: 'R9', RunTime: 300, StopTime: 0
        }, {
          FromStationID: 'R9', ToStationID: 'R6', RunTime: 300, StopTime: 0
        }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/Station/TRTC')) {
      calls.metroStations += 1;
      response.end(JSON.stringify([
        {
          StationUID: 'TRTC-BL01', StationID: 'BL01', StationName: { Zh_tw: '捷運起點' },
          StationPosition: { PositionLat: 25.0478, PositionLon: 121.5170 }
        },
        {
          StationUID: 'TRTC-BL02', StationID: 'BL02', StationName: { Zh_tw: '捷運終點' },
          StationPosition: { PositionLat: 25.0143, PositionLon: 121.4638 }
        },
        {
          StationUID: 'TRTC-BL03', StationID: 'BL03', StationName: { Zh_tw: '交會站' },
          StationPosition: { PositionLat: 25.01, PositionLon: 121.45 }
        },
        {
          StationUID: 'TRTC-R01', StationID: 'R01', StationName: { Zh_tw: '交會站' },
          StationPosition: { PositionLat: 25.01, PositionLon: 121.45 }
        },
        {
          StationUID: 'TRTC-R02', StationID: 'R02', StationName: { Zh_tw: '捷運新終點' },
          StationPosition: { PositionLat: 24.99, PositionLon: 121.44 }
        }
      ]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/StationOfRoute/TRTC')) {
      calls.metroRoutes += 1;
      response.end(JSON.stringify([{
        RouteID: 'BL', LineID: 'BL', RouteName: { Zh_tw: '板南線' }, Direction: 0,
        Stations: [
          { StationID: 'BL01', StationName: { Zh_tw: '捷運起點' }, StopSequence: 1 },
          { StationID: 'BL02', StationName: { Zh_tw: '捷運終點' }, StopSequence: 2 },
          { StationID: 'BL03', StationName: { Zh_tw: '交會站' }, StopSequence: 3 }
        ]
      }, {
        RouteID: 'R', LineID: 'R', RouteName: { Zh_tw: '淡水信義線' }, Direction: 0,
        Stations: [
          { StationID: 'R01', StationName: { Zh_tw: '交會站' }, StopSequence: 1 },
          { StationID: 'R02', StationName: { Zh_tw: '捷運新終點' }, StopSequence: 2 }
        ]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/StationTimeTable/TRTC')) {
      calls.metroTimetables += 1;
      response.end(JSON.stringify([{
        StationID: 'BL01', RouteID: 'BL', Direction: 0,
        Timetables: [
          { DepartureTime: departedTime.time },
          { DepartureTime: originTime.time }
        ]
      }, {
        StationID: 'R01', RouteID: 'R', Direction: 0,
        Timetables: [{ DepartureTime: connectionDepartureTime.time }]
      }, {
        StationID: 'BL02', RouteID: 'BL', Direction: 0,
        Timetables: [{ DepartureTime: connectionDepartureTime.time }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/ODFare/TRTC')) {
      calls.metroFares += 1;
      response.end(JSON.stringify([{
        OriginStationID: 'BL01', DestinationStationID: 'BL02', Fares: [{ Price: 25 }]
      }, {
        OriginStationID: 'BL01', DestinationStationID: 'R02', Fares: [{ Price: 35 }]
      }, {
        OriginStationID: 'BL02', DestinationStationID: 'BL03', Fares: [{ Price: 30 }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/S2STravelTime/TRTC')) {
      calls.metroTravelTimes += 1;
      response.end(JSON.stringify([{
        RouteID: 'BL', TravelTimes: [{
          FromStationID: 'BL01', ToStationID: 'BL02', RunTime: 1500, StopTime: 0
        }, {
          FromStationID: 'BL02', ToStationID: 'BL03', RunTime: 180, StopTime: 20
        }]
      }, {
        RouteID: 'R', TravelTimes: [{
          FromStationID: 'R01', ToStationID: 'R02', RunTime: 300, StopTime: 0
        }]
      }]));
      return;
    }
    if (request.url.includes('/v2/Rail/Metro/LiveBoard/TRTC')) {
      calls.realtimeMetro += 1;
      response.end(JSON.stringify([{
        LineID: 'BL', StationName: { Zh_tw: '捷運起點' }, EstimateTime: 120,
        UpdateTime: new Date().toISOString()
      }]));
      return;
    }
    if (request.url.includes('/v1/Parking/OffStreet/CarPark/City/Taipei')) {
      calls.parkingLots += 1;
      response.end(JSON.stringify([{
        CarParkID: 'P-CACHE', CarParkName: { Zh_tw: '快取測試停車場' },
        CarParkPosition: { PositionLat: 25.0332, PositionLon: 121.5656 }, TotalSpaces: 20
      }]));
      return;
    }
    if (request.url.includes('/v1/Parking/OffStreet/ParkingAvailability/City/Taipei')) {
      calls.parkingAvailability += 1;
      response.end(JSON.stringify([{
        CarParkID: 'P-CACHE', TotalSpaces: 20, AvailableSpaces: 8, ServiceStatus: 1
      }]));
      return;
    }
    response.end('[]');
  });

  const mockPort = await listen(mock);
  const appPort = await availablePort();
  const cacheFile = path.join(os.tmpdir(), `journey-api-${process.pid}-${appPort}.json`);
  const graphCacheFile = path.join(os.tmpdir(), `journey-graph-${process.pid}-${appPort}.json`);
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !/^TDX_CLIENT_(?:ID|SECRET)(?:_\d+)?$/.test(name)
      && !/^TDX_SHARED_CLIENT_(?:ID|SECRET)$/.test(name)
      && name !== 'TDX_CREDENTIALS_JSON'
      && !['TDX_REFRESH_INTERVAL_MS', 'TDX_DYNAMIC_REFRESH_INTERVAL_MS',
        'TDX_MOBILITY_REFRESH_INTERVAL_MS', 'TDX_STATIC_REFRESH_INTERVAL_MS'].includes(name)
      && !/^GRAPHHOPPER_API_KEY(?:_\d+)?$/.test(name)));
  const env = {
    ...cleanEnvironment,
    SKIP_ENV_FILE: 'true',
    HOST: '127.0.0.1',
    PORT: String(appPort),
    BUS_REALTIME_CACHE_FILE: cacheFile,
    JOURNEY_GRAPH_CACHE_FILE: graphCacheFile,
    TDX_API_ROOT: `http://127.0.0.1:${mockPort}/api/basic`,
    TDX_TOKEN_ENDPOINT: `http://127.0.0.1:${mockPort}/token`,
    GRAPHHOPPER_API_ROOT: `http://127.0.0.1:${mockPort}/graphhopper/route`,
    GRAPHHOPPER_API_KEY_1: 'graphhopper-first',
    GRAPHHOPPER_API_KEY_2: 'graphhopper-second',
    NOMINATIM_ENDPOINT: `http://127.0.0.1:${mockPort}/reverse`,
    TDX_CLIENT_ID_1: 'fixed-first',
    TDX_CLIENT_SECRET_1: 'fixed-first-secret',
    TDX_CLIENT_ID_2: 'fixed-second',
    TDX_CLIENT_SECRET_2: 'fixed-second-secret',
    TDX_CLIENT_ID_3: 'realtime',
    TDX_CLIENT_SECRET_3: 'realtime-secret',
    TDX_CLIENT_ID_4: 'detail-first',
    TDX_CLIENT_SECRET_4: 'detail-first-secret',
    TDX_CLIENT_ID_5: 'detail-second',
    TDX_CLIENT_SECRET_5: 'detail-second-secret',
    TDX_REQUEST_SPACING_MS: '1',
    TDX_REFRESH_INTERVAL_MS: '86400000',
    TDX_DYNAMIC_REFRESH_INTERVAL_MS: '12000',
    TDX_MOBILITY_REFRESH_INTERVAL_MS: '1800000',
    TDX_STATIC_REFRESH_INTERVAL_MS: '86400000',
    ROUTE_PLANNER_TIMEOUT_MS: '5000',
    JOURNEY_BOOKING_WINDOW_DAYS: '28'
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const status = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/status`);
      return response.ok ? response.json() : null;
    });
    assert.equal(status.credentials.tdxPrimaryCredentialCount, 1);
    assert.equal(status.credentials.tdxReserveCredentialCount, 0);
    assert.equal(status.credentials.graphHopperApiKeyCount, 2);
    assert.equal(status.tdxStaticRefreshIntervalSeconds, 86_400);
    assert.equal(status.tdxDynamicRefreshIntervalSeconds, 12);
    assert.equal(status.journeyStaticRefreshIntervalSeconds, 86_400);
    assert.equal(status.journeyLiveRefreshIntervalSeconds, 12);
    assert.equal(status.journeyGraphActiveWindowSeconds, 300);
    assert.deepEqual(status.journeyGraphCache.memory, { bus: 0, rail: 0, metro: 0 });
    assert.equal(status.routePlannerResultCacheSeconds, 12);
    assert.equal(status.routePlannerTimeoutSeconds, 5);
    assert.equal(status.journeyBookingWindowDays, 28);

    const hsinchuRegionResponse = await fetch(`${baseUrl}/api/geocode/reverse?lat=24.83&lng=121.01`);
    const hsinchuRegion = await hsinchuRegionResponse.json();
    assert.equal(hsinchuRegionResponse.status, 200);
    assert.equal(hsinchuRegion.data.city, '新竹縣');
    assert.equal(hsinchuRegion.data.district, '竹北市');

    const taipeiRegionResponse = await fetch(`${baseUrl}/api/geocode/reverse?lat=25.03&lng=121.56`);
    const taipeiRegion = await taipeiRegionResponse.json();
    assert.equal(taipeiRegionResponse.status, 200);
    assert.equal(taipeiRegion.data.city, '臺北市');
    assert.equal(taipeiRegion.data.district, '信義區');

    const sharedEntryResponse = await fetch(`${baseUrl}/?journey=open`);
    assert.equal(sharedEntryResponse.status, 200);
    const sharedEntryHtml = await sharedEntryResponse.text();
    assert.match(sharedEntryHtml, /id="journey-modal"/);
    assert.match(sharedEntryHtml, /id="journey-origin-city-select"/);
    assert.match(sharedEntryHtml, /id="journey-destination-city-select"/);
    assert.match(sharedEntryHtml, /在主地圖顯示路線/);
    assert.match(sharedEntryHtml, /transportDataSuspended/);
    assert.match(sharedEntryHtml, /<span class="sm:hidden">服務<\/span>/);
    assert.match(sharedEntryHtml, /<span class="lg:hidden">交通<\/span>/);
    assert.match(sharedEntryHtml, /id="journey-swap-button"/);
    assert.match(sharedEntryHtml, /id="route-planner-swap-button"/);
    assert.match(sharedEntryHtml, /id="route-pick-origin-button"/);
    assert.match(sharedEntryHtml, /id="route-pick-destination-button"/);
    assert.match(sharedEntryHtml, /id="route-map-center-pin"/);
    assert.match(sharedEntryHtml, /快速時間估算/);
    assert.match(sharedEntryHtml, /ROUTE_TIME_ESTIMATE_PROFILES/);
    assert.match(sharedEntryHtml, /function estimateRouteTravelMinutes/);
    assert.match(sharedEntryHtml, /function buildRouteTimeEstimates/);
    assert.match(sharedEntryHtml, /function routeEstimateTimeIsAvailable/);
    assert.match(sharedEntryHtml, /routePlannerTimeInput\.removeAttribute\('max'\)/);
    assert.match(sharedEntryHtml, /new URL\('https:\/\/www\.google\.com\/maps\/dir\/'\)/);
    assert.match(sharedEntryHtml, /new URL\('https:\/\/maps\.apple\.com\/'\)/);
    assert.match(sharedEntryHtml, /google\.searchParams\.set\('dir_action', 'navigate'\)/);
    assert.match(sharedEntryHtml, /'Google 地圖', result\.navigation\.google/);
    assert.match(sharedEntryHtml, /'Apple 地圖', result\.navigation\.apple/);
    assert.match(sharedEntryHtml, /使用 \$\{label\}導航/);
    assert.match(sharedEntryHtml, /實際路線與時間請以開啟的導航服務為準/);
    assert.match(sharedEntryHtml, /function formatRouteDuration/);
    assert.doesNotMatch(sharedEntryHtml, /fetchOfficialData\('\/api\/route\/planner'/);
    assert.doesNotMatch(
      sharedEntryHtml,
      /<input[^>]+value="(?:car|scooter|walk|bike)"/
    );
    assert.match(sharedEntryHtml, /value="bus" checked>公車/);
    assert.match(sharedEntryHtml, /value="tra" checked>火車/);
    assert.match(sharedEntryHtml, /value="metro" checked>捷運/);
    assert.match(sharedEntryHtml, /value="thsr" checked>高鐵/);
    assert.match(sharedEntryHtml, /input:checked:not\(:disabled\)/);
    assert.match(sharedEntryHtml, /const fixedModes = \['car', 'scooter', 'walk', 'bike'\]/);

    const optionsUrl = `${baseUrl}/api/tdx/journey/options?mode=tra`;
    const optionsResponse = await fetch(optionsUrl);
    const options = await optionsResponse.json();
    assert.equal(optionsResponse.status, 200);
    assert.equal(options.refreshIntervalSeconds, 86_400);
    assert.deepEqual(
      options.data.stations.map((station) => station.name),
      ['臺北', '萬華', '板橋', '新竹', '苗栗', '南科', '新市', '三塊厝', '高雄']
    );
    assert.deepEqual(
      options.data.stations.map((station) => station.city),
      ['臺北市', '臺北市', '新北市', '新竹市', '苗栗縣', '臺南市', '臺南市', '高雄市', '高雄市']
    );
    assert.equal(new Set(options.data.stations.filter((station) => (
      ['臺北', '萬華'].includes(station.name)
    )).map((station) => station.city)).size, 1);
    await fetch(optionsUrl);
    assert.equal(calls.fixedStations, 1);

    const departureTime = `${queryTime.date}T${queryTime.time}`;
    const plannedDepartureTime = `${plannedQueryTime.date}T${plannedQueryTime.time}`;
    const pastTime = taipeiDateTime(now - 5 * 60_000);
    const pastSearchUrl = new URL('/api/tdx/journey/search', baseUrl);
    pastSearchUrl.search = new URLSearchParams({
      mode: 'tra', originId: '1000', destinationId: '1001',
      departureTime: `${pastTime.date}T${pastTime.time}`
    });
    const pastSearchResponse = await fetch(pastSearchUrl);
    assert.equal(pastSearchResponse.status, 400);
    assert.match((await pastSearchResponse.json()).message, /已經過去/);

    const unavailableTime = taipeiDateTime(now + 29 * 24 * 60 * 60_000);
    const unavailableSearchUrl = new URL('/api/tdx/journey/search', baseUrl);
    unavailableSearchUrl.search = new URLSearchParams({
      mode: 'tra', originId: '1000', destinationId: '1001',
      departureTime: `${unavailableTime.date}T${unavailableTime.time}`
    });
    const unavailableSearchResponse = await fetch(unavailableSearchUrl);
    assert.equal(unavailableSearchResponse.status, 400);
    assert.match((await unavailableSearchResponse.json()).message, /28 天內/);

    const searchUrl = new URL('/api/tdx/journey/search', baseUrl);
    searchUrl.search = new URLSearchParams({
      mode: 'tra', originId: '1000', destinationId: '1001', departureTime
    });
    const searchResponse = await fetch(searchUrl);
    const search = await searchResponse.json();
    assert.equal(searchResponse.status, 200);
    assert.equal(search.refreshIntervalSeconds, 12);
    assert.equal(search.data.results.length, 1);
    assert.ok(search.data.results.every((result) => !result.title.includes('099')));
    assert.equal(search.data.results[0].title, '自強號 101 次');
    assert.equal(search.data.results[0].fareLabel, '40～80 元');
    assert.equal(search.data.results[0].canTrack, true);
    assert.ok(search.data.results[0].boardingTimestamp >= now);
    assert.equal(search.data.results[0].legs[0].stops.length, 2);
    assert.ok(search.data.results[0].legs[0].stops.every((stop) => (
      Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    )));
    assert.equal(calls.fixedTimetables, 1);
    assert.equal(calls.fixedFares, 1);
    const railStaticCalls = {
      stations: calls.fixedStations,
      timetables: calls.fixedTimetables,
      fares: calls.fixedFares,
      live: calls.realtimeTrain
    };
    await fetch(searchUrl);
    assert.deepEqual({
      stations: calls.fixedStations,
      timetables: calls.fixedTimetables,
      fares: calls.fixedFares,
      live: calls.realtimeTrain
    }, railStaticCalls);

    const transferRailUrl = new URL('/api/tdx/journey/search', baseUrl);
    transferRailUrl.search = new URLSearchParams({
      mode: 'tra', originId: '1000', destinationId: '1003', departureTime: plannedDepartureTime
    });
    const transferRailResponse = await fetch(transferRailUrl);
    const transferRail = await transferRailResponse.json();
    assert.equal(transferRailResponse.status, 200);
    assert.equal(transferRail.data.results[0].transferCount, 1);
    assert.equal(transferRail.data.results[0].transfers[0].stationName, '新竹');
    assert.equal(transferRail.data.results[0].transfers[0].lat, 24.8016);
    assert.equal(transferRail.data.results[0].transfers[0].lng, 120.9716);
    assert.equal(transferRail.data.results[0].fareLabel, '合計約 190 元');
    assert.equal(transferRail.data.results[0].legs.length, 2);

    const liveUrl = new URL('/api/tdx/journey/live', baseUrl);
    liveUrl.search = new URLSearchParams(search.data.results[0].tracking);
    const liveResponse = await fetch(liveUrl);
    const live = await liveResponse.json();
    assert.equal(liveResponse.status, 200);
    assert.equal(live.refreshIntervalSeconds, 12);
    assert.equal(live.data.title, '臺鐵 101 次');
    assert.equal(live.data.position.lat, 25.0143);
    assert.match(live.data.accuracy, /非連續 GPS/);
    await fetch(liveUrl);
    assert.equal(calls.realtimeTrain, 1);
    assert.equal(calls.fixedStations, 1);
    assert.ok(calls.fixedTimetables >= 2);

    await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/tdx/bus?scope=all`);
      const payload = await response.json();
      return payload.totalBuses > 0 ? payload : null;
    }, 30_000);
    assert.ok(calls.realtimeBus >= 1);
    const busOptionsResponse = await fetch(
      `${baseUrl}/api/tdx/journey/options?mode=bus&city=Taipei`
    );
    const busOptions = await busOptionsResponse.json();
    assert.equal(busOptionsResponse.status, 200);
    assert.deepEqual(
      new Set(busOptions.data.stations.map((station) => station.id)),
      new Set(['BSTA', 'BSTO', 'BSTB', 'BSTX', 'BSTC'])
    );
    const busSearchUrl = new URL('/api/tdx/journey/search', baseUrl);
    busSearchUrl.search = new URLSearchParams({
      mode: 'bus', city: 'Taipei', originId: 'BSTA', destinationId: 'BSTB', departureTime
    });
    const busSearchResponse = await fetch(busSearchUrl);
    const busSearch = await busSearchResponse.json();
    assert.equal(busSearchResponse.status, 200);
    assert.equal(busSearch.refreshIntervalSeconds, 12);
    assert.equal(busSearch.data.results.length, 2);
    assert.equal(busSearch.data.results[0].title, '測試公車・BUS-001');
    assert.equal(busSearch.data.results[1].title, '測試公車・BUS-LATE');
    assert.ok(busSearch.data.results[0].boardingTimestamp < busSearch.data.results[1].boardingTimestamp);
    assert.equal(busSearch.data.results[0].fareLabel, '全票 15 元');
    assert.equal(busSearch.data.results[0].canTrack, true);
    assert.ok(calls.busEtaFilters.some((filter) => filter?.includes("StopUID eq 'STOP-A'")));
    assert.ok(calls.busEtaFilters.every((filter) => filter?.includes('StopUID eq')));
    assert.ok(calls.busStopOfRouteSelects.every((select) => select === null));
    assert.ok(calls.busRouteSelects.every((select) => select === null));
    assert.ok(calls.busScheduleSelects.every((select) => select?.includes('Frequencys')));
    assert.ok(busSearch.data.results[0].legs[0].stops.every((stop) => (
      Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    )));
    const busLiveUrl = new URL('/api/tdx/journey/live', baseUrl);
    busLiveUrl.search = new URLSearchParams(busSearch.data.results[0].tracking);
    const busLiveResponse = await fetch(busLiveUrl);
    const busLive = await busLiveResponse.json();
    assert.equal(busLiveResponse.status, 200);
    assert.equal(busLive.data.position.lat, 25.0478);
    assert.equal(busLive.data.stops.length, 3);

    const busTransferUrl = new URL('/api/tdx/journey/search', baseUrl);
    busTransferUrl.search = new URLSearchParams({
      mode: 'bus', city: 'Taipei', originId: 'BSTA', destinationId: 'BSTC', departureTime
    });
    const busTransferResponse = await fetch(busTransferUrl);
    const busTransfer = await busTransferResponse.json();
    assert.equal(busTransferResponse.status, 200);
    assert.equal(busTransfer.data.results[0].transferCount, 1);
    assert.equal(busTransfer.data.results[0].transfers[0].stationName, '公車轉乘站');
    assert.equal(busTransfer.data.results[0].transfers[0].lat, 25.03);
    assert.equal(busTransfer.data.results[0].transfers[0].lng, 121.49);
    assert.equal(busTransfer.data.results[0].fareLabel, '合計約 35 元');

    const scheduledBusUrl = new URL('/api/tdx/journey/search', baseUrl);
    scheduledBusUrl.search = new URLSearchParams({
      mode: 'bus', city: 'Taipei', originId: 'BSTA', destinationId: 'BSTB',
      departureTime: plannedDepartureTime
    });
    const scheduledBusResponse = await fetch(scheduledBusUrl);
    const scheduledBus = await scheduledBusResponse.json();
    assert.equal(scheduledBusResponse.status, 200);
    assert.ok(scheduledBus.data.results.some((result) => result.title.includes('表定班次')));

    const thsrSearchUrl = new URL('/api/tdx/journey/search', baseUrl);
    const thsrOptionsResponse = await fetch(`${baseUrl}/api/tdx/journey/options?mode=thsr`);
    const thsrOptions = await thsrOptionsResponse.json();
    assert.deepEqual(
      thsrOptions.data.stations.map((station) => station.id),
      ['THSR-0990', 'THSR-1000', 'THSR-1060', 'THSR-1070']
    );
    thsrSearchUrl.search = new URLSearchParams({
      mode: 'thsr', originId: 'THSR-0990', destinationId: 'THSR-1000', departureTime
    });
    const thsrSearchResponse = await fetch(thsrSearchUrl);
    const thsrSearch = await thsrSearchResponse.json();
    assert.equal(thsrSearchResponse.status, 200);
    assert.equal(thsrSearch.data.results[0].title, '高鐵 0801 次');
    assert.equal(thsrSearch.data.results[0].fareLabel, '40 元');
    assert.equal(thsrSearch.data.results[0].canTrack, false);
    assert.equal(thsrSearch.data.results[0].tracking.originId, '0990');
    assert.equal(thsrSearch.data.results[0].tracking.destinationId, '1000');
    assert.ok(thsrSearch.data.results[0].legs[0].stops.every((stop) => (
      Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    )));
    const thsrLiveUrl = new URL('/api/tdx/journey/live', baseUrl);
    thsrLiveUrl.search = new URLSearchParams(thsrSearch.data.results[0].tracking);
    const thsrLiveResponse = await fetch(thsrLiveUrl);
    const thsrLive = await thsrLiveResponse.json();
    assert.equal(thsrLiveResponse.status, 200);
    assert.match(thsrLive.data.accuracy, /時刻表推估/);
    assert.equal(thsrLive.refreshIntervalSeconds, 12);

    const metroOptionsResponse = await fetch(
      `${baseUrl}/api/tdx/journey/options?mode=metro&city=Taipei&system=TRTC`
    );
    const metroOptions = await metroOptionsResponse.json();
    assert.equal(metroOptionsResponse.status, 200);
    assert.ok(metroOptions.data.stations.some((station) => station.id === 'TRTC-R02'));
    const metroSearchUrl = new URL('/api/tdx/journey/search', baseUrl);
    metroSearchUrl.search = new URLSearchParams({
      mode: 'metro', city: 'Taipei', system: 'TRTC',
      originId: 'TRTC-BL01', destinationId: 'TRTC-BL02', departureTime
    });
    const metroSearchResponse = await fetch(metroSearchUrl);
    const metroSearch = await metroSearchResponse.json();
    assert.equal(metroSearchResponse.status, 200);
    assert.equal(metroSearch.data.results.length, 1);
    assert.equal(metroSearch.data.results[0].fareLabel, '25 元');
    assert.equal(metroSearch.data.results[0].canTrack, false);
    assert.ok(metroSearch.data.results[0].legs[0].stops.every((stop) => (
      Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    )));
    const metroLiveUrl = new URL('/api/tdx/journey/live', baseUrl);
    metroLiveUrl.search = new URLSearchParams(metroSearch.data.results[0].tracking);
    const metroLiveResponse = await fetch(metroLiveUrl);
    const metroLive = await metroLiveResponse.json();
    assert.equal(metroLiveResponse.status, 200);
    assert.equal(metroLive.data.title, '臺北捷運 板南線');
    assert.match(metroLive.data.accuracy, /時刻表與站間時間推估/);

    const metroTransferUrl = new URL('/api/tdx/journey/search', baseUrl);
    metroTransferUrl.search = new URLSearchParams({
      mode: 'metro', city: 'Taipei', system: 'TRTC',
      originId: 'TRTC-BL01', destinationId: 'TRTC-R02', departureTime: plannedDepartureTime
    });
    const metroTransferResponse = await fetch(metroTransferUrl);
    const metroTransfer = await metroTransferResponse.json();
    assert.equal(metroTransferResponse.status, 200);
    assert.equal(metroTransfer.data.results[0].transferCount, 1);
    assert.equal(metroTransfer.data.results[0].transfers[0].stationName, '交會站');
    assert.equal(metroTransfer.data.results[0].transfers[0].lat, 25.01);
    assert.equal(metroTransfer.data.results[0].transfers[0].lng, 121.45);
    assert.equal(metroTransfer.data.results[0].fareLabel, '35 元');
    const metroStaticCalls = {
      stations: calls.metroStations,
      routes: calls.metroRoutes,
      timetables: calls.metroTimetables,
      fares: calls.metroFares,
      travelTimes: calls.metroTravelTimes,
      live: calls.realtimeMetro
    };
    await fetch(metroSearchUrl);
    assert.deepEqual({
      stations: calls.metroStations,
      routes: calls.metroRoutes,
      timetables: calls.metroTimetables,
      fares: calls.metroFares,
      travelTimes: calls.metroTravelTimes,
      live: calls.realtimeMetro
    }, metroStaticCalls);

    const persistedGraphs = await waitFor(() => {
      if (!fs.existsSync(graphCacheFile)) return null;
      const snapshot = JSON.parse(fs.readFileSync(graphCacheFile, 'utf8'));
      return Object.keys(snapshot.bus || {}).length
        && Object.keys(snapshot.rail || {}).length
        && Object.keys(snapshot.metro || {}).length
        ? snapshot
        : null;
    });
    assert.equal(persistedGraphs.version, 2);

    const plannerUrl = new URL('/api/route/planner', baseUrl);
    plannerUrl.search = new URLSearchParams({
      originLat: '25.0478', originLng: '121.5170', originName: '臺北車站',
      destinationLat: '25.0143', destinationLng: '121.4638', destinationName: '板橋車站',
      departureTime, modes: 'car,scooter'
    });
    const plannerResponse = await fetch(plannerUrl);
    const planner = await plannerResponse.json();
    assert.equal(plannerResponse.status, 200);
    assert.equal(planner.data.results[0].mode, 'car');
    assert.ok(planner.data.results[0].durationMinutes > planner.data.results[0].baseDurationMinutes);
    assert.ok(planner.data.results[0].trafficLightDelayMinutes > 0);
    assert.equal(planner.data.results[0].geometry.length, 2);
    assert.ok(planner.data.results.some((result) => result.mode === 'scooter'));
    assert.equal(planner.data.results.filter((result) => result.mode === 'car').length, 1);
    assert.equal(planner.data.results.filter((result) => result.mode === 'scooter').length, 1);
    assert.equal(calls.roadRoutes, 2);
    assert.ok(calls.roadMethods.every((method) => method === 'GET'));
    assert.ok(calls.roadProfiles.filter((profile) => profile === 'car').length >= 2);
    assert.ok(calls.roadCustomModels.every((model) => model === null));
    assert.ok(calls.roadSnapPreventions.some((values) => (
      values.includes('motorway') && values.includes('trunk')
    )));
    assert.ok(calls.roadAlternativeLimits.every((limit) => limit === null));
    assert.ok(calls.roadAlgorithms.every((algorithm) => algorithm === null));
    assert.equal(planner.data.results[0].source, 'GraphHopper');

    const activeRoutePlannerUrl = new URL('/api/route/planner', baseUrl);
    activeRoutePlannerUrl.search = new URLSearchParams({
      originLat: '25.0478', originLng: '121.5170', originName: '臺北車站',
      destinationLat: '25.0143', destinationLng: '121.4638', destinationName: '板橋車站',
      departureTime, modes: 'walk,bike', strategy: 'direct'
    });
    const activeRoutePlannerResponse = await fetch(activeRoutePlannerUrl);
    const activeRoutePlanner = await activeRoutePlannerResponse.json();
    assert.equal(activeRoutePlannerResponse.status, 200);
    assert.equal(activeRoutePlanner.data.strategy, 'direct');
    assert.deepEqual(
      new Set(activeRoutePlanner.data.results.map((result) => result.mode)),
      new Set(['walk', 'bike'])
    );
    assert.ok(activeRoutePlanner.data.results.every((result) => result.trafficLightDelayMinutes === 0));
    assert.equal(activeRoutePlanner.data.results.filter((result) => result.mode === 'walk').length, 1);
    assert.equal(activeRoutePlanner.data.results.filter((result) => result.mode === 'bike').length, 1);
    assert.ok(calls.roadProfiles.includes('foot'));
    assert.ok(calls.roadProfiles.includes('bike'));

    const transitPlannerUrl = new URL('/api/route/planner', baseUrl);
    transitPlannerUrl.search = new URLSearchParams({
      originLat: '25.0478', originLng: '121.5170', originName: '公車起點', originCity: '臺北市',
      destinationLat: '25.0143', destinationLng: '121.4638', destinationName: '公車終點', destinationCity: '臺北市',
      departureTime, modes: 'bus'
    });
    const transitPlannerResponse = await fetch(transitPlannerUrl);
    const transitPlanner = await transitPlannerResponse.json();
    assert.equal(transitPlannerResponse.status, 200);
    assert.equal(transitPlanner.data.results[0].mode, 'bus');
    assert.equal(transitPlanner.data.results[0].legs[0].mode, 'walk');
    assert.equal(transitPlanner.data.results[0].legs.at(-1).mode, 'walk');
    assert.equal(transitPlanner.data.warnings.length, 0);
    assert.deepEqual(
      transitPlanner.data.results.map((result) => result.id),
      [...transitPlanner.data.results].sort(transitUserBenefitSort).map((result) => result.id)
    );
    assert.ok(transitPlanner.data.results.every((result) => result.distanceMeters > 0));
    assert.ok(transitPlanner.data.results.every((result) => (
      Number.isFinite(result.userBenefitScore)
      && Number.isFinite(result.walkingMinutes)
      && Number.isFinite(result.waitingMinutes)
    )));
    const plannerBusLeg = transitPlanner.data.results[0].legs.find((leg) => leg.mode === 'bus');
    assert.ok(Number.isFinite(plannerBusLeg.departureTimestamp));
    assert.ok(Number.isFinite(plannerBusLeg.arrivalTimestamp));
    assert.ok(plannerBusLeg.departureTime);
    assert.ok(plannerBusLeg.arrivalTime);
    assert.ok(plannerBusLeg.stops.every((stop) => (
      stop.departureTime && stop.arrivalTime && stop.timeEstimated === true
    )));
    const plannerCallsAfterFirstSearch = {
      fixedStations: calls.fixedStations,
      fixedTimetables: calls.fixedTimetables,
      fixedFares: calls.fixedFares,
      busEtaFilters: calls.busEtaFilters.length
    };
    const cachedTransitPlannerResponse = await fetch(transitPlannerUrl);
    assert.equal(cachedTransitPlannerResponse.status, 200);
    assert.deepEqual({
      fixedStations: calls.fixedStations,
      fixedTimetables: calls.fixedTimetables,
      fixedFares: calls.fixedFares,
      busEtaFilters: calls.busEtaFilters.length
    }, plannerCallsAfterFirstSearch);

    const multimodalPlannerUrl = new URL('/api/route/planner', baseUrl);
    multimodalPlannerUrl.search = new URLSearchParams({
      originLat: '25.06', originLng: '121.53', originName: '社區', originCity: '臺北市',
      destinationLat: '25.01', destinationLng: '121.45', destinationName: '捷運目的地', destinationCity: '新北市',
      departureTime: plannedDepartureTime, modes: 'bus,tra,metro,thsr'
    });
    const multimodalPlannerResponse = await fetch(multimodalPlannerUrl);
    const multimodalPlanner = await multimodalPlannerResponse.json();
    assert.equal(multimodalPlannerResponse.status, 200);
    const busRailMetro = multimodalPlanner.data.results.find((result) => (
      result.mode === 'multimodal'
      && result.modeSequence.join(',') === 'bus,tra,metro'
    ));
    assert.ok(busRailMetro);
    assert.deepEqual(
      busRailMetro.legs.filter((leg) => leg.mode !== 'walk').map((leg) => leg.mode),
      ['bus', 'tra', 'metro']
    );
    assert.ok(busRailMetro.transferCount >= 2);
    assert.ok(busRailMetro.arrivalTimestamp > busRailMetro.boardingTimestamp);

    const mixedRoadTransitUrl = new URL('/api/route/planner', baseUrl);
    mixedRoadTransitUrl.search = new URLSearchParams({
      originLat: '25.06', originLng: '121.53', originName: '混合運具起點', originCity: '臺北市',
      destinationLat: '25.01', destinationLng: '121.45', destinationName: '混合運具終點', destinationCity: '新北市',
      departureTime: plannedDepartureTime, modes: 'car,scooter,bus,tra,metro,thsr'
    });
    const mixedRoadTransitResponse = await fetch(mixedRoadTransitUrl);
    const mixedRoadTransit = await mixedRoadTransitResponse.json();
    assert.equal(mixedRoadTransitResponse.status, 200);
    const mixedCandidate = mixedRoadTransit.data.results.find((result) => (
      result.mode === 'multimodal'
      && result.modeSequence.some((mode) => mode === 'car' || mode === 'scooter')
      && new Set(result.modeSequence.filter((mode) => ['bus', 'tra', 'metro', 'thsr'].includes(mode))).size >= 2
    ));
    assert.ok(
      mixedCandidate,
      `expected road plus multiple transit modes; received ${JSON.stringify(
        mixedRoadTransit.data.results.map((result) => result.modeSequence || [result.mode])
      )}`
    );
    assert.ok(mixedCandidate.transferCount >= 2);
    assert.ok(mixedRoadTransit.data.results
      .filter((result) => result.mode === 'multimodal')
      .every((result) => !result.modeSequence.includes('car')));
    assert.ok(mixedCandidate.legs.some((leg) => (
      ['car', 'scooter'].includes(leg.mode) && Array.isArray(leg.geometry) && leg.geometry.length
    )));

    const southPlannerUrl = new URL('/api/route/planner', baseUrl);
    southPlannerUrl.search = new URLSearchParams({
      originLat: '23.0923809', originLng: '120.3088807',
      originName: '新市大營郵局', originCity: '臺南市',
      destinationLat: '22.6195179', destinationLng: '120.2966363',
      destinationName: '漢來大飯店', destinationCity: '高雄市',
      departureTime: plannedDepartureTime, modes: 'bus,tra,metro'
    });
    const etaCallsBeforeSouthPlanner = calls.busEtaFilters.length;
    console.log('south planner eta before', etaCallsBeforeSouthPlanner, calls.busEtaFilters);
    const southPlannerResponse = await fetch(southPlannerUrl);
    const southPlanner = await southPlannerResponse.json();
    assert.equal(southPlannerResponse.status, 200);
    const walkRailBus = southPlanner.data.results.find((result) => (
      result.mode === 'multimodal'
      && result.modeSequence.join(',') === 'tra,bus'
    ));
    assert.ok(walkRailBus);
    assert.deepEqual(
      walkRailBus.legs.filter((leg) => leg.mode !== 'walk').map((leg) => leg.mode),
      ['tra', 'bus']
    );
    assert.equal(walkRailBus.legs[0].mode, 'walk');
    assert.equal(walkRailBus.legs.at(-1).mode, 'walk');
    console.log('south planner eta after', calls.busEtaFilters.length, calls.busEtaFilters);
    assert.equal(calls.busEtaFilters.length, etaCallsBeforeSouthPlanner);

    const southDirectUrl = new URL(southPlannerUrl);
    southDirectUrl.searchParams.set('strategy', 'direct');
    const southDirectResponse = await fetch(southDirectUrl);
    const southDirect = await southDirectResponse.json();
    assert.equal(southDirectResponse.status, 200);
    assert.equal(southDirect.data.strategy, 'direct');
    assert.ok(southDirect.data.results.some((result) => result.mode === 'tra'));
    assert.ok(southDirect.data.results.every((result) => result.mode !== 'multimodal'));
    const plannerRailLeg = southDirect.data.results
      .find((result) => result.mode === 'tra').legs.find((leg) => leg.mode === 'tra');
    assert.ok(plannerRailLeg.departureTime);
    assert.ok(plannerRailLeg.arrivalTime);
    assert.ok(plannerRailLeg.stops.every((stop) => (
      stop.departureTime && stop.arrivalTime && stop.timeEstimated === false
    )));

    const dreamMallPrepareUrl = new URL('/api/route/planner', baseUrl);
    dreamMallPrepareUrl.search = new URLSearchParams({
      originLat: '23.0923809', originLng: '120.3088807',
      originName: '新市大營郵局', originCity: '臺南市',
      destinationLat: '22.5947', destinationLng: '120.3069',
      destinationName: '高雄夢時代', destinationCity: '高雄市',
      departureTime: plannedDepartureTime,
      modes: 'car,scooter,bus,tra,metro,thsr',
      strategy: 'prepare'
    });
    const dreamMallPrepareResponse = await fetch(dreamMallPrepareUrl);
    const dreamMallPrepare = await dreamMallPrepareResponse.json();
    assert.equal(dreamMallPrepareResponse.status, 200);
    assert.equal(dreamMallPrepare.data.strategy, 'prepare');
    assert.equal(dreamMallPrepare.data.complete, true);
    assert.ok(dreamMallPrepare.data.results.every((result) => result.mode !== 'multimodal'));

    const dreamMallPlannerUrl = new URL(dreamMallPrepareUrl);
    dreamMallPlannerUrl.searchParams.set('strategy', 'multimodal');
    const dreamMallPlannerResponse = await fetch(dreamMallPlannerUrl);
    const dreamMallPlanner = await dreamMallPlannerResponse.json();
    assert.equal(dreamMallPlannerResponse.status, 200);
    assert.equal(dreamMallPlanner.data.strategy, 'multimodal');
    assert.ok(dreamMallPlanner.data.results.every((result) => result.mode === 'multimodal'));
    assert.deepEqual(
      dreamMallPlanner.data.results.map((result) => result.id),
      [...dreamMallPlanner.data.results].sort(transitUserBenefitSort).map((result) => result.id)
    );
    const scooterRailMetro = dreamMallPlanner.data.results.find((result) => (
      result.mode === 'multimodal'
      && result.modeSequence.join(',') === 'scooter,tra,metro'
    ));
    assert.ok(
      scooterRailMetro,
      `expected scooter,tra,metro; received ${JSON.stringify(
        dreamMallPlanner.data.results.map((result) => result.modeSequence || [result.mode])
      )}`
    );
    assert.deepEqual(
      scooterRailMetro.legs.filter((leg) => leg.mode !== 'walk').map((leg) => leg.mode),
      ['scooter', 'tra', 'metro']
    );
    assert.equal(scooterRailMetro.legs.find((leg) => leg.mode === 'tra').origin, '新市');
    assert.equal(scooterRailMetro.legs.find((leg) => leg.mode === 'metro').destination, '凱旋');
    assert.equal(scooterRailMetro.legs.at(-1).mode, 'walk');

    const hanlaiPlannerUrl = new URL('/api/route/planner', baseUrl);
    hanlaiPlannerUrl.search = new URLSearchParams({
      originLat: '23.0923809', originLng: '120.3088807',
      originName: '新市大營郵局', originCity: '臺南市',
      destinationLat: '22.6195179', destinationLng: '120.2966363',
      destinationName: '高雄漢來大飯店', destinationCity: '高雄市',
      departureTime: plannedDepartureTime,
      modes: 'bus,tra,metro,thsr',
      strategy: 'multimodal'
    });
    const hanlaiPlannerResponse = await fetch(hanlaiPlannerUrl);
    const hanlaiPlanner = await hanlaiPlannerResponse.json();
    assert.equal(hanlaiPlannerResponse.status, 200);
    assert.ok(hanlaiPlanner.data.results.length >= 2);
    assert.ok(hanlaiPlanner.data.results.length <= 5);
    assert.deepEqual(
      hanlaiPlanner.data.results.map((result) => result.id),
      [...hanlaiPlanner.data.results].sort(transitUserBenefitSort).map((result) => result.id)
    );
    assert.ok(hanlaiPlanner.data.results.some((result) => (
      result.modeSequence.join(',') === 'tra,bus'
    )), JSON.stringify(hanlaiPlanner.data.results.map((result) => result.modeSequence)));
    const railMetroResults = hanlaiPlanner.data.results.filter((result) => (
      result.modeSequence.join(',') === 'tra,metro'
    ));
    assert.ok(railMetroResults.length > 0, JSON.stringify(
      hanlaiPlanner.data.results.map((result) => result.modeSequence)
    ));
    assert.ok(railMetroResults.some((result) => (
      result.legs.find((leg) => leg.mode === 'tra')?.destination === '高雄'
      && result.legs.find((leg) => leg.mode === 'metro')?.origin === '高雄車站'
    )));
    assert.ok(railMetroResults.every((result) => (
      result.legs.find((leg) => leg.mode === 'tra')?.destination !== '三塊厝'
    )));
    assert.ok(hanlaiPlanner.data.results.every((result) => result.durationMinutes < 360));
    assert.ok(hanlaiPlanner.data.results.every((result) => result.legs.every((leg) => (
      leg.mode !== 'walk' || Number(leg.distanceMeters) <= 8_000
    ))));
    assert.ok(hanlaiPlanner.data.results.every((result) => result.legs.every((leg) => (
      leg.mode !== 'thsr' || !(leg.origin === '左營' && leg.destination === '台南')
    ))));

    const crossCityPlannerUrl = new URL('/api/route/planner', baseUrl);
    crossCityPlannerUrl.search = new URLSearchParams({
      originLat: '25.0478', originLng: '121.5170', originName: '跨縣市起點', originCity: '臺南市',
      destinationLat: '25.0143', destinationLng: '121.4638', destinationName: '跨縣市終點', destinationCity: '高雄市',
      departureTime, modes: 'bus,tra,metro,thsr'
    });
    const crossCityPlannerResponse = await fetch(crossCityPlannerUrl);
    const crossCityPlanner = await crossCityPlannerResponse.json();
    assert.equal(crossCityPlannerResponse.status, 200);
    assert.deepEqual(
      new Set(crossCityPlanner.data.results.map((result) => result.mode)),
      new Set(['tra', 'thsr'])
    );
    assert.ok(crossCityPlanner.data.results.every((result) => result.boardingTimestamp >= now));
    assert.ok(crossCityPlanner.data.warnings.some((warning) => warning.startsWith('公車：')));
    assert.ok(crossCityPlanner.data.warnings.some((warning) => warning.startsWith('捷運：')));

    delayNextRoadRoute = true;
    const deadlinePlannerUrl = new URL('/api/route/planner', baseUrl);
    deadlinePlannerUrl.search = new URLSearchParams({
      originLat: '25.0489', originLng: '121.5161', originName: '截止時間起點', originCity: '臺北市',
      destinationLat: '25.0121', destinationLng: '121.4621', destinationName: '截止時間終點', destinationCity: '新北市',
      departureTime, modes: 'car,tra'
    });
    const deadlineStartedAt = Date.now();
    const deadlinePlannerResponse = await fetch(deadlinePlannerUrl);
    const deadlineElapsedMs = Date.now() - deadlineStartedAt;
    const deadlinePlanner = await deadlinePlannerResponse.json();
    assert.equal(deadlinePlannerResponse.status, 200);
    assert.ok(deadlineElapsedMs < 6_500, `planner exceeded hard deadline: ${deadlineElapsedMs}ms`);
    assert.equal(deadlinePlanner.data.complete, false);
    assert.ok(deadlinePlanner.data.results.some((result) => result.mode === 'tra'));
    assert.ok(deadlinePlanner.data.warnings.some((warning) => warning.includes('計算時間')));

    const warmedDeadlineResponse = await fetch(deadlinePlannerUrl);
    const warmedDeadlinePlanner = await warmedDeadlineResponse.json();
    assert.equal(warmedDeadlineResponse.status, 200);
    assert.equal(warmedDeadlinePlanner.data.complete, true);
    assert.ok(warmedDeadlinePlanner.data.results.some((result) => result.mode === 'car'));

    failNextBusEta = true;
    omitBusSchedules = true;
    const degradedBusUrl = new URL('/api/tdx/journey/search', baseUrl);
    degradedBusUrl.search = new URLSearchParams({
      mode: 'bus', city: 'Tainan', originId: 'BSTO', destinationId: 'BSTB', departureTime
    });
    const degradedBusResponse = await fetch(degradedBusUrl);
    const degradedBus = await degradedBusResponse.json();
    assert.equal(degradedBusResponse.status, 200);
    assert.ok(degradedBus.data.results.length > 0);
    assert.ok(degradedBus.data.results.every((result) => result.canTrack === false));
    assert.ok(degradedBus.data.results.every((result) => result.statusLabel));

    const parkingUrl = `${baseUrl}/api/tdx/parking?lat=25.033&lng=121.5654&city=Taipei&radius=5000`;
    const firstParkingResponse = await fetch(parkingUrl);
    assert.equal(firstParkingResponse.status, 200);
    assert.equal((await firstParkingResponse.json()).refreshIntervalSeconds, 1_800);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const secondParkingResponse = await fetch(parkingUrl);
    assert.equal(secondParkingResponse.status, 200);
    assert.equal(calls.parkingLots, 1);
    assert.equal(calls.parkingAvailability, 1);
  } catch (error) {
    error.message += `\nServer output:\n${output}`;
    throw error;
  } finally {
    await stopChild(child);
    await new Promise((resolve) => mock.close(resolve));
    fs.rmSync(cacheFile, { force: true });
    fs.rmSync(graphCacheFile, { force: true });
    fs.rmSync(`${graphCacheFile}.tmp`, { force: true });
  }
});
