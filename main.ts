/*
Riven
load dependency
"nbiot": "file:../pxt-nbiot"
*/

//% color="#31C7D5" weight=10 icon="\uf1eb"
namespace nbiot {


    const PortSerial = [
        [SerialPin.P8, SerialPin.P0],
        [SerialPin.P12, SerialPin.P1],
        [SerialPin.P13, SerialPin.P2],
        [SerialPin.P15, SerialPin.P14]
    ]

    export enum SerialPorts {
        PORT1 = 0,
        PORT2 = 1,
        PORT3 = 2,
        PORT4 = 3
    }

    export class StringMessageHandler {
        topicName: string;
        fn: (stringMessage: string) => void;
    }

    type EvtStr = (data: string) => void;
    type EvtAct = () => void;
    type EvtNum = (data: number) => void;
    type EvtDict = (topic: string, data: string) => void;

    let lastCmd: string;
    let cmdCache: string[] = []
    let topicCB: StringMessageHandler[] = []

    serial.onDataReceived('\n', function () {
        let a = serial.readString()
        if (a.charAt(0) == '+') {
            let b = a.slice(1).split(":")
            let cmd = b[0]
            let params = b[1].split(',')
            console.log(">>" + cmd + "/"+ params.length() + "/" + params.join("#"))
        }

    })

    function sendAtCmd(op: string, cmd: string) {
        let str = "AT+" + op + "=" + cmd
        lastCmd = op
        serial.writeLine(str)
    }

    function cellInit() {
        // cell init sequence
        sendAtCmd("COPS", `1, 2, "46000"`)
        basic.pause(200)
        sendAtCmd("CSCON", "1")
        basic.pause(200)
        sendAtCmd("CEREG", "1")

    }

    /**
     * init serial port
     * @param tx Tx pin; eg: SerialPin.P1
     * @param rx Rx pin; eg: SerialPin.P2
    */
    //% blockId=nbiot_init block="NBIOT init|Tx pin %tx|Rx pin %rx"
    //% weight=100
    export function nbiot_init(tx: SerialPin, rx: SerialPin): void {
        serial.redirect(
            tx,
            rx,
            BaudRate.BaudRate9600
        )
        basic.pause(100)
        serial.setTxBufferSize(64)
        serial.setRxBufferSize(64)
        serial.readString()
        serial.writeString('\n\n')
        basic.pause(1000)
        cellInit();
    }

    //% blockId=nbiot_mqttconfig block="Mqtt Config Host %host|Port %port|ClientID %id|User %user|Pass %pass"
    //% weight=100
    export function nbiot_config(host: string, port: number, id: string, user?: string, pass?: string): void {
        let cmd = `"${host}",${port},"${id}",60,"${user}","${pass}",1`
        sendAtCmd("MQTTCFG", cmd)
    }

    //% blockId=nbiot_mqttconn block="Mqtt Connect"
    export function nbiot_mqttconn() {
        let cmd = `1,1,0,0,0,"",""`
        sendAtCmd("MQTTOPEN", cmd)
    }

    //% blockId=nbiot_mqttsub block="Mqtt Subscribe %topic"
    export function nbiot_mqttsub(topic: string, handler: (str: string) => void) {
        sendAtCmd("MQTTSUB", `"${topic}", 1`)
        cmdCache.push(cmd)        let topicHandler = new StringMessageHandler()
        topicHandler.fn = handler
        topicHandler.topicName = topic
        topicCB.push(topicHandler)
    }

    //% blockId=nbiot_mqttpub block="Mqtt Public %topic data%data||Qos %qos"
    export function nbiot_mqttpub(topic: string, data: string, qos?: number) {
        qos = qos ? 1 : 0;
        sendAtCmd("MQTTPUB", `"${topic}",${qos},0,0,0,"${data}"`)
    }

}
