"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsGeoJsonPolygonConstraint = void 0;
exports.IsGeoJsonPolygon = IsGeoJsonPolygon;
const class_validator_1 = require("class-validator");
let IsGeoJsonPolygonConstraint = class IsGeoJsonPolygonConstraint {
    validate(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
        }
        const candidate = value;
        if (candidate.type !== 'Polygon' && candidate.type !== 'MultiPolygon') {
            return false;
        }
        return Array.isArray(candidate.coordinates) && candidate.coordinates.length > 0;
    }
    defaultMessage(_args) {
        return 'polygon must be a GeoJSON Polygon or MultiPolygon object';
    }
};
exports.IsGeoJsonPolygonConstraint = IsGeoJsonPolygonConstraint;
exports.IsGeoJsonPolygonConstraint = IsGeoJsonPolygonConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'isGeoJsonPolygon', async: false })
], IsGeoJsonPolygonConstraint);
function IsGeoJsonPolygon(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsGeoJsonPolygonConstraint,
        });
    };
}
//# sourceMappingURL=is-geojson-polygon.validator.js.map