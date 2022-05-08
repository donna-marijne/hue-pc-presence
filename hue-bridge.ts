import { discovery, api as hueApi, ApiError, model } from "node-hue-api";
import { Api } from "node-hue-api/dist/esm/api/Api";
import { CreatedUser } from "node-hue-api/dist/esm/api/http/endpoints/configuration";
import { env } from "process";
import { randomUUID } from "crypto";

export const ENV_KEY = "HUE_PRESENCE_CREDENTIALS";

export class HueBridge {
  static async discover(): Promise<HueBridge> {
    const discoveryResults = await discovery.nupnpSearch();
    if (!discoveryResults || discoveryResults.length === 0) {
      throw new Error("Did not find any Hue bridges on the network.");
    }

    return new HueBridge(discoveryResults[0].ipaddress);
  }

  appName: string = "node-hue-api";
  deviceName: string = "hue-presence";

  get api(): Api {
    if (!this._api) {
      throw new Error("Call connect() before using the API.");
    }
    return this._api;
  }

  private _api?: Api;

  constructor(public address: string) {}

  async connect(): Promise<void> {
    const credentials =
      this.getCredentialsFromEnvironment() ??
      (await this.createNewCredentials());
    this._api = await hueApi
      .createLocal(this.address)
      .connect(credentials.username, credentials.clientkey);
  }

  async setPresence(name: string, value: boolean): Promise<void> {
    const sensor = await this.getOrCreatePresenceSensor(name);
    sensor.flag = value;
    const updateResult = await this.api.sensors.updateSensorState(sensor);
    if (!updateResult.flag) {
      throw new Error(
        `Failed to update sensor state:\n${JSON.stringify(sensor)}`
      );
    }
  }

  private async getOrCreatePresenceSensor(
    name: string
  ): Promise<model.CLIPGenericFlag> {
    return (
      (await this.getPresenceSensor(name)) ?? this.createPresenceSensor(name)
    );
  }

  private async getPresenceSensor(
    name: string
  ): Promise<model.CLIPGenericFlag | undefined> {
    return (await this.api.sensors.getAll()).find(
      (sensor) =>
        sensor instanceof model.CLIPGenericFlag && sensor.name === name
    ) as model.CLIPGenericFlag;
  }

  private async createPresenceSensor(
    name: string
  ): Promise<model.CLIPGenericFlag> {
    const sensor = new model.CLIPGenericFlag();
    sensor.modelid = "software";
    sensor.swversion = "1.0";
    sensor.uniqueid = randomUUID();
    sensor.manufacturername = "node-hue-api";
    sensor.name = name;
    sensor.flag = false;

    const result = (await this.api.sensors.createSensor(
      sensor
    )) as model.CLIPGenericFlag;

    console.log(`Created sensor ${result.name}`);

    return result;
  }

  private getCredentialsFromEnvironment(): CreatedUser | null {
    const envCredentials = env[ENV_KEY];
    if (!envCredentials) {
      return null;
    }

    const strings = envCredentials.split(":");
    return {
      username: strings[0],
      clientkey: strings[1],
    };
  }

  private async createNewCredentials(): Promise<CreatedUser> {
    const unauthenticatedApi = await hueApi.createLocal(this.address).connect();
    try {
      const newUser = await unauthenticatedApi.users.createUser(
        this.appName,
        this.deviceName
      );

      console.log(`Created a new user on ${this.address}:`);
      console.log(`${ENV_KEY}="${newUser.username}:${newUser.clientkey}"`);

      return newUser;
    } catch (err) {
      if (err instanceof ApiError && err.getHueErrorType?.() === 101) {
        console.error(`Press the Link button on ${this.address} and re-run.`);
      }
      throw err;
    }
  }
}
